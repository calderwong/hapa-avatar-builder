import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { orientEchoGardenSurfaceTowardCamera } from "../src/components/echo-record-garden-facing.js";

test("flat Record Garden surfaces face the camera in world space under a rotated parent", () => {
  const scene = new THREE.Scene();
  const stage = new THREE.Group();
  stage.position.set(0.4, 0, 0.25);
  stage.rotation.y = 0.37;
  scene.add(stage);

  const surface = new THREE.Group();
  surface.position.set(-1.2, 0.9, 1.4);
  surface.rotation.set(0.3, -0.4, 0.2);
  stage.add(surface);

  const camera = new THREE.PerspectiveCamera(47, 1, 0.05, 100);
  camera.position.set(4.2, 6.8, 10.5);
  camera.lookAt(0, 0.8, 0);
  scene.add(camera);
  scene.updateMatrixWorld(true);

  const originalPosition = surface.position.clone();
  assert.equal(orientEchoGardenSurfaceTowardCamera(surface, camera), true);
  scene.updateMatrixWorld(true);
  assert.deepEqual(surface.position.toArray(), originalPosition.toArray());

  const surfaceWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const surfaceWorldQuaternion = new THREE.Quaternion();
  const cameraWorldQuaternion = new THREE.Quaternion();
  surface.getWorldPosition(surfaceWorldPosition);
  camera.getWorldPosition(cameraWorldPosition);
  surface.getWorldQuaternion(surfaceWorldQuaternion);
  camera.getWorldQuaternion(cameraWorldQuaternion);

  const expectedFace = cameraWorldPosition.sub(surfaceWorldPosition).normalize();
  const actualFace = new THREE.Vector3(0, 1, 0).applyQuaternion(surfaceWorldQuaternion);
  assert.ok(actualFace.dot(expectedFace) > 0.999999, "the authored +Y face must point at the camera");

  const actualTop = new THREE.Vector3(0, 0, -1).applyQuaternion(surfaceWorldQuaternion);
  const expectedTop = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraWorldQuaternion);
  expectedTop.addScaledVector(expectedFace, -expectedTop.dot(expectedFace)).normalize();
  assert.ok(actualTop.dot(expectedTop) > 0.999999, "the authored top edge must follow camera-up");
});

test("camera-facing orientation fails safely when camera and surface share a position", () => {
  const surface = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  const before = surface.quaternion.clone();
  assert.equal(orientEchoGardenSurfaceTowardCamera(surface, camera), false);
  assert.ok(surface.quaternion.equals(before));
  assert.equal(orientEchoGardenSurfaceTowardCamera(null, camera), false);
  assert.equal(orientEchoGardenSurfaceTowardCamera(surface, null), false);
});
