"""
Database query optimizations and repository patterns
"""

from typing import List, Optional, Tuple

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import Order, Material, UploadedFile, User


class OrderRepository:
    """Optimized repository for Order queries"""
    
    @staticmethod
    async def get_with_relations(
        db: AsyncSession,
        order_id: int,
        *,
        include_user: bool = False,
        include_file: bool = True,
        include_material: bool = True
    ) -> Optional[Order]:
        """
        Get order with related entities loaded efficiently
        
        Args:
            db: Database session
            order_id: Order ID
            include_user: Whether to include user data
            include_file: Whether to include file data
            include_material: Whether to include material data
            
        Returns:
            Order with loaded relations
        """
        query = select(Order).where(Order.id == order_id)
        
        # Use selectinload for better performance with async
        if include_file:
            query = query.options(selectinload(Order.uploaded_file))
        if include_material:
            query = query.options(selectinload(Order.material))
        if include_user:
            query = query.options(selectinload(Order.user))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def list_with_materials(
        db: AsyncSession,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        user_id: Optional[int] = None
    ) -> List[Tuple[Order, Material]]:
        """
        List orders with material data using efficient join
        
        Args:
            db: Database session
            limit: Limit results
            offset: Offset for pagination
            status: Filter by status
            user_id: Filter by user ID
            
        Returns:
            List of (Order, Material) tuples
        """
        query = select(Order, Material).join(
            Material, Order.material_id == Material.id
        ).order_by(Order.created_at.desc())
        
        # Apply filters
        conditions = []
        if status:
            conditions.append(Order.status == status)
        if user_id:
            conditions.append(Order.user_id == user_id)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        query = query.offset(offset).limit(limit)
        
        result = await db.execute(query)
        return result.all()  # Returns list of tuples
    
    @staticmethod
    async def count_by_status(db: AsyncSession) -> dict:
        """
        Get order counts by status
        
        Args:
            db: Database session
            
        Returns:
            Dictionary mapping status to count
        """
        query = select(
            Order.status,
            func.count(Order.id).label('count')
        ).group_by(Order.status)
        
        result = await db.execute(query)
        rows = result.fetchall()
        
        return {row.status: row.count for row in rows}


class MaterialRepository:
    """Optimized repository for Material queries"""
    
    @staticmethod
    async def get_active_with_cache(db: AsyncSession) -> List[Material]:
        """
        Get all active materials (optimized for caching)
        
        Args:
            db: Database session
            
        Returns:
            List of active materials
        """
        query = select(Material).where(Material.is_active == True)
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_by_name(db: AsyncSession, name: str) -> Optional[Material]:
        """
        Get material by name (case-insensitive)
        
        Args:
            db: Database session
            name: Material name
            
        Returns:
            Material or None
        """
        query = select(Material).where(
            func.lower(Material.name) == func.lower(name)
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()


class UploadedFileRepository:
    """Optimized repository for UploadedFile queries"""
    
    @staticmethod
    async def get_by_file_id(db: AsyncSession, file_id: str) -> Optional[UploadedFile]:
        """
        Get uploaded file by file_id
        
        Args:
            db: Database session
            file_id: File ID
            
        Returns:
            UploadedFile or None
        """
        query = select(UploadedFile).where(UploadedFile.file_id == file_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_stale_files(db: AsyncSession, days: int = 7) -> List[UploadedFile]:
        """
        Get files older than specified days with no associated orders
        
        Args:
            db: Database session
            days: Age threshold in days
            
        Returns:
            List of stale files
        """
        from datetime import datetime, timedelta
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Find files with no orders
        query = select(UploadedFile).where(
            and_(
                UploadedFile.created_at < cutoff_date,
                ~UploadedFile.orders.any()  # No associated orders
            )
        )
        
        result = await db.execute(query)
        return list(result.scalars().all())


__all__ = [
    'OrderRepository',
    'MaterialRepository', 
    'UploadedFileRepository'
]