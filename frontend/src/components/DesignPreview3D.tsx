import React, { Suspense, useMemo, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { useAppStore } from '../store';
import { API_URL } from '../services/api';

function SVGModel({ url, thickness, color }: { url: string; thickness: number; color: string }) {
  const [shapes, setShapes] = useState<THREE.Shape[]>([]);

  useEffect(() => {
    const loader = new SVGLoader();
    fetch(url)
      .then(r => r.text())
      .then(svgText => {
        const data = loader.parse(svgText);
        const allShapes: THREE.Shape[] = [];
        data.paths.forEach(path => {
          const pathShapes = SVGLoader.createShapes(path);
          allShapes.push(...pathShapes);
        });
        setShapes(allShapes);
      })
      .catch(() => setShapes([]));
  }, [url]);

  const geometry = useMemo(() => {
    if (shapes.length === 0) return null;

    // Calculate bounding box to center the model
    const group = new THREE.Group();
    shapes.forEach(shape => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness * 0.1,
        bevelEnabled: false,
      });
      group.add(new THREE.Mesh(geo));
    });

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 4 / maxDim; // Normalize to fit view

    return { shapes, center, scale };
  }, [shapes, thickness]);

  if (!geometry) return null;

  return (
    <group
      scale={[geometry.scale, -geometry.scale, geometry.scale]}
      position={[
        -geometry.center.x * geometry.scale,
        geometry.center.y * geometry.scale,
        0,
      ]}
    >
      {geometry.shapes.map((shape, i) => (
        <mesh key={i}>
          <extrudeGeometry args={[shape, { depth: thickness * 0.1, bevelEnabled: false }]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function FallbackPreview({ url }: { url: string }) {
  return (
    <div className="preview-fallback">
      <img src={url} alt="Design Preview" />
    </div>
  );
}

export const DesignPreview3D: React.FC = () => {
  const { uploadedFile, selectedMaterial, selectedThickness } = useAppStore();
  const [use3D, setUse3D] = useState(true);
  const [error, setError] = useState(false);

  if (!uploadedFile) {
    return (
      <div className="preview-panel preview-empty">
        <div className="preview-placeholder">
          <p>Upload a design file to see a 3D preview</p>
        </div>
      </div>
    );
  }

  const previewUrl = `${API_URL}/upload/${uploadedFile.file_id}/raw`;
  const isSvg = uploadedFile.file_type === 'svg';
  const thickness = selectedThickness || 3;
  const color = selectedMaterial?.color_hex || '#0ea5e9';

  if (!isSvg || error || !use3D) {
    return (
      <div className="preview-panel">
        <div className="preview-header">
          <span>Design Preview</span>
          {isSvg && (
            <div className="preview-controls">
              <button
                className={`preview-toggle ${use3D ? 'active' : ''}`}
                onClick={() => { setUse3D(true); setError(false); }}
              >3D</button>
              <button
                className={`preview-toggle ${!use3D ? 'active' : ''}`}
                onClick={() => setUse3D(false)}
              >2D</button>
            </div>
          )}
        </div>
        <FallbackPreview url={previewUrl} />
      </div>
    );
  }

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <span>3D Preview</span>
        <div className="preview-controls">
          <button
            className={`preview-toggle ${use3D ? 'active' : ''}`}
            onClick={() => setUse3D(true)}
          >3D</button>
          <button
            className={`preview-toggle ${!use3D ? 'active' : ''}`}
            onClick={() => setUse3D(false)}
          >2D</button>
        </div>
      </div>
      <div className="preview-canvas">
        <Canvas
          camera={{ position: [0, 0, 8], fov: 45 }}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color('#0f172a'), 0);
          }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <Suspense fallback={null}>
            <SVGModel url={previewUrl} thickness={thickness} color={color} />
          </Suspense>
          <OrbitControls enablePan enableZoom enableRotate />
          <Grid
            args={[20, 20]}
            cellColor="#475569"
            sectionColor="#64748b"
            fadeDistance={25}
          />
        </Canvas>
      </div>
      <p className="preview-hint">Drag to rotate, scroll to zoom, right-click to pan</p>
    </div>
  );
};
