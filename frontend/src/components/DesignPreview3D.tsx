import React, { Suspense, useMemo, useRef, useCallback, useEffect, useState, Component } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { useAppStore } from '../store';
import { API_URL } from '../services/api';

// ─── Cache for parsed SVG data (persists across re-renders/remounts) ──────────
const svgCache = new Map<string, THREE.Shape[]>();

// ─── Error Boundary ───────────────────────────────────────────────────────────
interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError: () => void;
}
interface ErrorBoundaryState {
  hasError: boolean;
}

class CanvasErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ─── Auto-rotate that stops on user interaction ───────────────────────────────
function AutoRotateHelper({ controlsRef }: { controlsRef: React.MutableRefObject<any> }) {
  const interacted = useRef(false);

  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const stop = () => { interacted.current = true; };
    ctrl.domElement?.addEventListener('pointerdown', stop);
    return () => ctrl.domElement?.removeEventListener('pointerdown', stop);
  }, [controlsRef]);

  useFrame(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.autoRotate = !interacted.current;
    ctrl.update();
  });

  return null;
}

// ─── Merged geometry model ────────────────────────────────────────────────────
function SVGModel({
  url,
  thickness,
  color,
  handleError,
}: {
  url: string;
  thickness: number;
  color: string;
  handleError: () => void;
}) {
  const [shapes, setShapes] = useState<THREE.Shape[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { invalidate } = useThree();
  const controlsRef = useRef<any>(null);

  // Fetch + parse SVG, with module-level cache
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (svgCache.has(url)) {
      setShapes(svgCache.get(url)!);
      setLoading(false);
      invalidate();
      return;
    }

    const loader = new SVGLoader();
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`SVG fetch failed: ${r.status}`);
        return r.text();
      })
      .then(svgText => {
        if (cancelled) return;
        const data = loader.parse(svgText);
        const allShapes: THREE.Shape[] = [];
        data.paths.forEach(path => {
          SVGLoader.createShapes(path).forEach(s => allShapes.push(s));
        });
        svgCache.set(url, allShapes);
        setShapes(allShapes);
        setLoading(false);
        invalidate();
      })
      .catch(() => {
        if (!cancelled) {
          setShapes([]);
          setLoading(false);
          handleError(); // Trigger 2D fallback on parse/fetch error
        }
      });

    return () => { cancelled = true; };
  }, [url, invalidate]);

  // Build a single merged BufferGeometry (1 draw call regardless of shape count)
  const { mergedGeo, transform, isComplex } = useMemo(() => {
    if (!shapes || shapes.length === 0) {
      return { mergedGeo: null, transform: null, isComplex: false };
    }

    const complex = shapes.length > 500;
    const extrudeOpts: THREE.ExtrudeGeometryOptions = complex
      ? { depth: thickness * 0.1, bevelEnabled: false, steps: 1 }
      : { depth: thickness * 0.1, bevelEnabled: false };

    const geos: THREE.BufferGeometry[] = [];
    for (const shape of shapes) {
      try {
        geos.push(new THREE.ExtrudeGeometry(shape, extrudeOpts));
      } catch {
        // skip degenerate shapes
      }
    }

    if (geos.length === 0) return { mergedGeo: null, transform: null, isComplex: complex };

    // Merge all into one draw call
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    geos.forEach((g, i) => { if (i > 0 || geos.length > 1) g.dispose(); });

    // Compute centering transform
    merged.computeBoundingBox();
    const box = merged.boundingBox!;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 4 / maxDim : 1;

    return {
      mergedGeo: merged,
      transform: { center, scale },
      isComplex: complex,
    };
  }, [shapes, thickness]);

  if (loading) {
    return (
      <Html center>
        <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', pointerEvents: 'none' }}>
          <div className="spinner" style={{
            width: 24, height: 24, border: '2px solid #334155',
            borderTop: '2px solid #0ea5e9', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 8px',
          }} />
          Loading preview…
        </div>
      </Html>
    );
  }

  if (!mergedGeo || !transform) {
    if (!loading) handleError();
    return null;
  }

  return (
    <>
      {isComplex && (
        <Html position={[0, 2.8, 0]} center>
          <div style={{
            background: 'rgba(15,23,42,0.85)', color: '#f59e0b',
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            border: '1px solid #f59e0b', pointerEvents: 'none',
          }}>
            Complex design — simplified rendering ({shapes!.length} shapes)
          </div>
        </Html>
      )}
      <group
        scale={[transform.scale, -transform.scale, transform.scale]}
        position={[
          -transform.center.x * transform.scale,
           transform.center.y * transform.scale,
          0,
        ]}
      >
        <mesh
          geometry={mergedGeo}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
        </mesh>
      </group>
      <AutoRotateHelper controlsRef={controlsRef} />
    </>
  );
}

// ─── Scene lighting ───────────────────────────────────────────────────────────
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#bfdbfe', '#1e293b', 0.35]} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.1}
        shadow-camera-far={50}
      />
      <directionalLight position={[-5, -3, -5]} intensity={0.15} />
    </>
  );
}

// ─── Fallback 2D preview ──────────────────────────────────────────────────────
function FallbackPreview({ url }: { url: string }) {
  return (
    <div className="preview-fallback">
      <img src={url} alt="Design Preview" />
    </div>
  );
}

// ─── Controls wrapped to expose ref ──────────────────────────────────────────
function Controls() {
  return (
    <OrbitControls
      enablePan
      enableZoom
      enableRotate
      enableDamping
      dampingFactor={0.05}
      minDistance={2}
      maxDistance={20}
      autoRotate
      autoRotateSpeed={0.5}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * Preview component — 2D/3D toggle over a vector design.
 *
 * Two call modes:
 *   1. Upload wizard: no props → reads the uploaded file + selected material
 *      from Zustand. Legacy behaviour.
 *   2. Standalone (e.g. design detail page): pass `fileId` and optionally
 *      `thicknessMm` / `colorHex` to render an arbitrary design without
 *      involving the upload store.
 */
interface DesignPreview3DProps {
  fileId?: string;
  thicknessMm?: number;
  colorHex?: string;
}

export const DesignPreview3D: React.FC<DesignPreview3DProps> = ({
  fileId: fileIdProp,
  thicknessMm: thicknessProp,
  colorHex: colorProp,
}) => {
  const { uploadedFile, fileAnalysis, selectedMaterial, selectedThickness } = useAppStore();
  const [use3D, setUse3D] = useState(true);
  const [error, setError] = useState(false);

  const isImage = uploadedFile?.file_type && ['png', 'jpg', 'jpeg'].includes(uploadedFile.file_type);

  // Automatically switch to 2D for images
  useEffect(() => {
    if (isImage && use3D) {
      setUse3D(false);
    }
  }, [isImage]);

  const handleError = useCallback(() => setError(true), []);

  // Prop-driven first (standalone usage), fall back to Zustand (upload wizard)
  const fileId = fileIdProp ?? uploadedFile?.file_id;
  if (!fileId) {
    return (
      <div className="preview-panel preview-empty">
        <div className="preview-placeholder">
          <p>Upload a design file to see a 3D preview</p>
        </div>
      </div>
    );
  }

  const previewUrl = `${API_URL}/upload/${fileId}/svg`;
  const thickness = thicknessProp ?? selectedThickness ?? 3;
  const color = colorProp ?? selectedMaterial?.color_hex ?? '#0ea5e9';
  // Always use the /svg endpoint for preview — it serves with Content-Disposition: inline
  const fallbackUrl = previewUrl;

  const healthColor = fileAnalysis?.health_status === 'optimal' ? '#10b981' : fileAnalysis?.health_status === 'warning' ? '#f59e0b' : '#ef4444';

  const header = (
    <div className="preview-header" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <span>{use3D && !error ? '3D Preview' : 'Design Preview'}</span>
        {fileAnalysis && (
          <div style={{ 
            fontSize: '0.65rem', 
            background: `${healthColor}20`, 
            color: healthColor, 
            padding: '2px 8px', 
            borderRadius: 4, 
            border: `1px solid ${healthColor}`,
            textTransform: 'uppercase',
            fontWeight: 'bold',
            letterSpacing: '0.02em'
          }}>
            Health: {fileAnalysis.health_status}
          </div>
        )}
      </div>
      <div className="preview-controls">
        {!isImage && (
          <button
            className={`preview-toggle ${use3D ? 'active' : ''}`}
            onClick={() => { setUse3D(true); setError(false); }}
          >3D</button>
        )}
        <button
          className={`preview-toggle ${!use3D || isImage ? 'active' : ''}`}
          onClick={() => setUse3D(false)}
        >2D</button>
      </div>
    </div>
  );

  if (error || !use3D) {
    return (
      <div className="preview-panel">
        {header}
        <FallbackPreview url={fallbackUrl} />
      </div>
    );
  }

  return (
    <div className="preview-panel">
      {header}
      <div className="preview-canvas">
        <CanvasErrorBoundary onError={handleError}>
          <Canvas
            key={fileId}
            frameloop="demand"
            dpr={[1, 2]}
            performance={{ min: 0.5 }}
            camera={{ position: [0, 0, 8], fov: 45 }}
            shadows
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(new THREE.Color('#0f172a'), 0);
            }}
          >
            <SceneLighting />
            <Suspense fallback={null}>
              <SVGModel url={previewUrl} thickness={thickness} color={color} handleError={handleError} />
            </Suspense>
            <Controls />
            <Grid
              args={[20, 20]}
              cellColor="#475569"
              sectionColor="#64748b"
              fadeDistance={25}
            />
          </Canvas>
        </CanvasErrorBoundary>
      </div>
      <p className="preview-hint">Drag to rotate · Scroll to zoom · Right-click to pan</p>
      
      {fileAnalysis?.validation_issues && fileAnalysis.validation_issues.length > 0 && (
        <div className="preview-validation">
          {fileAnalysis.validation_issues.map((issue, idx) => (
            <div key={idx} className={`validation-item validation-${issue.severity}`}>
              <span className="validation-msg">{issue.message}</span>
              {issue.count > 1 && <span className="validation-count">×{issue.count}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
