"""
Async file processing worker for LaserHub
Handles file parsing and analysis in background
"""

import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from concurrent.futures import ProcessPoolExecutor
import uuid

from app.core.config import settings
from app.core.cache import cache

logger = logging.getLogger(__name__)


class FileProcessingPool:
    """Process pool for CPU-intensive file parsing operations"""
    
    def __init__(self, max_workers: Optional[int] = None):
        self.max_workers = max_workers or min(4, (settings.MAX_WORKERS if hasattr(settings, 'MAX_WORKERS') else 4))
        self._executor: Optional[ProcessPoolExecutor] = None
    
    def start(self):
        """Start the process pool"""
        if not self._executor:
            self._executor = ProcessPoolExecutor(max_workers=self.max_workers)
    
    def stop(self):
        """Stop the process pool"""
        if self._executor:
            self._executor.shutdown(wait=True)
            self._executor = None
    
    async def parse_file(self, file_path: str, file_id: str) -> Dict[str, Any]:
        """
        Parse file in process pool to avoid blocking event loop
        
        Args:
            file_path: Path to file
            file_id: File ID for caching
            
        Returns:
            File analysis results
        """
        # Check cache first
        cached_result = await cache.get(f"file_analysis:{file_id}")
        if cached_result:
            return cached_result
        
        # Run parsing in process pool
        loop = asyncio.get_event_loop()
        
        try:
            result = await loop.run_in_executor(
                self._executor,
                self._parse_file_sync,
                file_path
            )
            
            # Cache result
            await cache.set(f"file_analysis:{file_id}", result, expire=3600)
            
            return result
        except Exception as e:
            logger.error(f"Error parsing file {file_path}: {e}")
            # Return minimal result on error
            return {
                "format": Path(file_path).suffix.lower(),
                "width_mm": None,
                "height_mm": None,
                "area_cm2": None,
                "cut_length_mm": None,
                "error": str(e)
            }
    
    @staticmethod
    def _parse_file_sync(file_path: str) -> Dict[str, Any]:
        """Synchronous file parsing (runs in separate process)"""
        try:
            from app.utils.file_parser import parse_generic
            return parse_generic(file_path)
        except Exception as e:
            return {
                "format": Path(file_path).suffix.lower(),
                "width_mm": None,
                "height_mm": None,
                "area_cm2": None,
                "cut_length_mm": None,
                "error": str(e)
            }


# Global processing pool
_processing_pool: Optional[FileProcessingPool] = None


def get_processing_pool() -> FileProcessingPool:
    """Get or create global processing pool"""
    global _processing_pool
    if _processing_pool is None:
        _processing_pool = FileProcessingPool()
        _processing_pool.start()
    return _processing_pool


async def shutdown_processing_pool():
    """Shutdown processing pool"""
    global _processing_pool
    if _processing_pool:
        _processing_pool.stop()
        _processing_pool = None


class FileProcessingQueue:
    """Async queue for file processing tasks"""
    
    def __init__(self):
        self._queue: Optional[asyncio.Queue] = None
        self._workers: Optional[list] = None
        self._running = False
    
    async def start(self, num_workers: int = 2):
        """Start the processing queue"""
        self._queue = asyncio.Queue(maxsize=1000)
        self._workers = []
        self._running = True
        
        # Start worker tasks
        for i in range(num_workers):
            worker = asyncio.create_task(
                self._worker(f"worker-{i}"),
                name=f"file-processor-{i}"
            )
            self._workers.append(worker)
    
    async def stop(self):
        """Stop the processing queue"""
        self._running = False
        
        # Signal all workers to stop
        if self._workers:
            for worker in self._workers:
                worker.cancel()
            
            # Wait for workers to finish
            await asyncio.gather(*self._workers, return_exceptions=True)
            self._workers = None
    
    async def enqueue(self, file_path: str, file_id: str) -> str:
        """
        Add file to processing queue
        
        Args:
            file_path: Path to file
            file_id: File ID
            
        Returns:
            Task ID
        """
        if not self._queue:
            raise RuntimeError("Processing queue not started")
        
        task_id = str(uuid.uuid4())
        task = {
            "task_id": task_id,
            "file_path": file_path,
            "file_id": file_id,
            "status": "queued"
        }
        
        await self._queue.put(task)
        await cache.set(f"task:{task_id}", task, expire=3600)
        
        return task_id
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task status"""
        task = await cache.get(f"task:{task_id}")
        return task
    
    async def _worker(self, name: str):
        """Worker task for processing files"""
        pool = get_processing_pool()
        
        while self._running:
            try:
                task = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=1.0
                )
                
                # Update status to processing
                task["status"] = "processing"
                await cache.set(f"task:{task}", task)
                
                try:
                    # Process file
                    result = await pool.parse_file(
                        task["file_path"],
                        task["file_id"]
                    )
                    
                    # Update status to completed
                    task["status"] = "completed"
                    task["result"] = result
                    
                except Exception as e:
                    # Update status to failed
                    task["status"] = "failed"
                    task["error"] = str(e)
                
                # Save final status
                await cache.set(f"task:{task_id}", task, expire=7200)  # 2 hours
                
                # Mark task as done
                self._queue.task_done()
                
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {name} error: {e}")


# Global processing queue
_processing_queue: Optional[FileProcessingQueue] = None


def get_processing_queue() -> FileProcessingQueue:
    """Get or create global processing queue"""
    global _processing_queue
    if _processing_queue is None:
        _processing_queue = FileProcessingQueue()
    return _processing_queue


async def start_processing_workers(num_workers: int = 2):
    """Start file processing workers"""
    queue = get_processing_queue()
    await queue.start(num_workers)
    
    # Also start process pool
    get_processing_pool()


async def stop_processing_workers():
    """Stop file processing workers"""
    global _processing_queue
    
    if _processing_queue:
        await _processing_queue.stop()
        _processing_queue = None
    
    await shutdown_processing_pool()


# Helper functions for backward compatibility
async def parse_file_async(file_path: str, file_id: str) -> Dict[str, Any]:
    """
    Parse file asynchronously using process pool
    
    Args:
        file_path: Path to file
        file_id: File ID for caching
        
    Returns:
        File analysis results
    """
    pool = get_processing_pool()
    return await pool.parse_file(file_path, file_id)


__all__ = [
    'FileProcessingPool',
    'FileProcessingQueue',
    'get_processing_pool',
    'get_processing_queue',
    'start_processing_workers',
    'stop_processing_workers',
    'parse_file_async'
]