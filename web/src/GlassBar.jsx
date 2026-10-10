// Barra lateral de vidro 3D (baseada no Fluid Glass do React Bits, modo "bar").
// O fundo animado é renderizado num buffer e o vidro (MeshTransmissionMaterial) refrata esse buffer.
import * as THREE from 'three';
import { useMemo, useRef, useState } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { MeshTransmissionMaterial, RoundedBox, useFBO } from '@react-three/drei';
import { easing } from 'maath';

// manchas de cor do fundo (as mesmas cores do dashboard), desenhadas como gradiente radial
function blobTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d').createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  const x = c.getContext('2d'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BLOBS = [['#00b0ac', 0.35, -0.2, 1.1], ['#006173', -0.3, 0.35, 1.3], ['#5cbba4', 0.1, -0.45, 0.9], ['#0f3b5c', -0.2, 0.1, 1.4]];

function Backdrop() {
  const { viewport } = useThree(), refs = useRef([]);
  const tex = useMemo(() => BLOBS.map(b => blobTexture(b[0])), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.25;
    refs.current.forEach((m, i) => { if (!m) return; const [, x, y] = BLOBS[i]; m.position.set((x + Math.sin(t + i * 1.7) * 0.15) * viewport.width, (y + Math.cos(t * 0.8 + i) * 0.2) * viewport.height, -2 - i * 0.01); });
  });
  return <>
    <mesh position={[0, 0, -3]} scale={[viewport.width * 3, viewport.height * 3, 1]}><planeGeometry /><meshBasicMaterial color="#071a26" toneMapped={false} /></mesh>
    {BLOBS.map((b, i) => <mesh key={i} ref={el => (refs.current[i] = el)} scale={[viewport.width * b[3] * 1.4, viewport.width * b[3] * 1.4, 1]}><planeGeometry /><meshBasicMaterial map={tex[i]} transparent toneMapped={false} depthWrite={false} /></mesh>)}
  </>;
}

function Glass() {
  const glass = useRef(), buffer = useFBO();
  const { viewport } = useThree();
  const [scene] = useState(() => new THREE.Scene());
  useFrame((state, delta) => {
    const { gl, camera, pointer } = state;
    // o vidro inclina de leve atrás do ponteiro, com mola
    easing.damp3(glass.current.rotation, [pointer.y * 0.12, pointer.x * 0.18, 0], 0.25, delta);
    gl.setRenderTarget(buffer); gl.render(scene, camera); gl.setRenderTarget(null);
  });
  const w = viewport.width * 0.92, h = viewport.height * 0.96;
  return <>
    {createPortal(<Backdrop />, scene)}
    <mesh scale={[viewport.width, viewport.height, 1]}><planeGeometry /><meshBasicMaterial map={buffer.texture} toneMapped={false} /></mesh>
    <RoundedBox ref={glass} args={[w, h, 0.6]} radius={0.28} smoothness={6} position={[0, 0, 1]}>
      <MeshTransmissionMaterial buffer={buffer.texture} transmission={1} roughness={0} thickness={2.2} ior={1.18}
        chromaticAberration={0.06} anisotropy={0.05} distortion={0.15} distortionScale={0.4} temporalDistortion={0.08}
        color="#ffffff" attenuationColor="#cffaf6" attenuationDistance={2.5} backside={false} />
    </RoundedBox>
  </>;
}

export default function GlassBar() {
  return (
    <div className="glassbar" aria-hidden="true">
      <Canvas dpr={[1, 1.75]} orthographic={false} camera={{ position: [0, 0, 10], fov: 30 }} gl={{ alpha: true, antialias: true, toneMapping: THREE.NoToneMapping }}
        eventSource={document.body} eventPrefix="client">
        <Glass />
      </Canvas>
    </div>
  );
}
