import * as THREE from 'three';

/**
 * Intro bubble transition: fills the view with animated soap bubbles that rise and clear.
 * Returns a promise that resolves once all bubbles have left the frame.
 */
export function createBubbleTransition(scene, camera) {
  const bubbles = [];
  const bubbleCount = 150;

  // Create bubble material: semi-transparent, white/blue tinted with specular highlight
  const bubbleMaterial = new THREE.MeshStandardMaterial({
    color: 0xd0e8f2,
    metalness: 0.5,
    roughness: 0.1,
    transparent: true,
    opacity: .5,
    depthWrite: false, // overlapping transparent bubbles otherwise flicker as their draw order changes
  });

  const geometry = new THREE.IcosahedronGeometry(1, 4);

  // Position bubbles to fill the camera view
  for (let i = 0; i < bubbleCount; i++) {
    // Own material per bubble so each can fade independently.
    const bubble = new THREE.Mesh(geometry, bubbleMaterial.clone());

    // Random size variation (0.08 to 0.25 meters)
    const scale = 0.08 + Math.random() * 0.17;
    bubble.scale.set(scale, scale, scale);

    // Position in front of camera to occlude the scene
    // Spread across the view frustum
    const vFOV = THREE.MathUtils.degToRad(camera.fov / 2);
    const height = 2 * Math.tan(vFOV) * (camera.position.z - 0.1);
    const width = height * camera.aspect;

    bubble.position.set(
      (Math.random() - 0.5) * width * 0.9,
      (Math.random() - 0.5) * height * 0.9 - 0.3,
      camera.position.z - 1.0
    );

    // Random drift speed and wobble
    bubble.userData.vY = 0.3 + Math.random() * 0.4; // rise speed (m/s)
    bubble.userData.vX = (Math.random() - 0.5) * 0.15; // horizontal drift
    bubble.userData.vZ = (Math.random() - 0.5) * 0.15;
    bubble.userData.wobbleAmount = Math.random() * 0.05;
    bubble.userData.wobblePhase = Math.random() * Math.PI * 2;

    bubbles.push(bubble);
    scene.add(bubble);
  }

  // Return a promise that resolves when all bubbles have cleared
  return new Promise((resolve) => {
    const startTime = performance.now();
    const maxDuration = 10; // seconds
    const baseOpacity = bubbleMaterial.opacity;
    const probe = new THREE.Vector3();
    let last = startTime;

    function removeBubble(i) {
      scene.remove(bubbles[i]);
      bubbles[i].material.dispose();
      bubbles.splice(i, 1);
    }

    function finish() {
      while (bubbles.length) removeBubble(bubbles.length - 1);
      geometry.dispose();
      bubbleMaterial.dispose();
      resolve();
    }

    function animate(now) {
      // Real elapsed time keeps the speed the same on 60 Hz and high-refresh displays.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if ((now - startTime) / 1000 > maxDuration) {
        finish();
        return;
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i];
        const d = bubble.userData;

        d.vY *= Math.pow(1.002, dt * 60); // accelerate slightly as it rises
        d.wobblePhase += 1.2 * dt;
        bubble.position.y += d.vY * dt;
        bubble.position.x += (d.vX + Math.sin(d.wobblePhase) * d.wobbleAmount) * dt;
        bubble.position.z += d.vZ * dt;

        // Fade each bubble out over the top half of the screen.
        const centerY = probe.copy(bubble.position).project(camera).y;
        bubble.material.opacity = baseOpacity * THREE.MathUtils.clamp(1 - centerY, 0, 1);

        // Cleared once the bubble's lowest point has risen past the top edge of the screen.
        probe.copy(bubble.position).y -= bubble.scale.y;
        if (probe.project(camera).y > 1) removeBubble(i);
      }

      if (bubbles.length === 0) finish();
      else requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  });
}
