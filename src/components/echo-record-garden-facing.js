import * as THREE from "three";

const ORIENTATION_EPSILON = 1e-10;

/**
 * Rotates a flat Record Garden surface so its authored +Y face points toward
 * the camera and its authored -Z top edge stays aligned with camera-up.
 * The resulting world orientation is converted back into the object's parent
 * space, so translated or rotated stage parents do not change the behavior.
 */
export function orientEchoGardenSurfaceTowardCamera(surface, camera) {
  if (!surface?.isObject3D || !camera?.isCamera) return false;

  surface.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);

  const surfacePosition = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  surface.getWorldPosition(surfacePosition);
  camera.getWorldPosition(cameraPosition);

  const faceDirection = cameraPosition.sub(surfacePosition);
  if (faceDirection.lengthSq() <= ORIENTATION_EPSILON) return false;
  faceDirection.normalize();

  const cameraQuaternion = new THREE.Quaternion();
  camera.getWorldQuaternion(cameraQuaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion);
  cameraUp.addScaledVector(faceDirection, -cameraUp.dot(faceDirection));

  if (cameraUp.lengthSq() <= ORIENTATION_EPSILON) {
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion);
    cameraUp.crossVectors(faceDirection, cameraRight);
  }
  if (cameraUp.lengthSq() <= ORIENTATION_EPSILON) return false;
  cameraUp.normalize();

  const localZInWorld = cameraUp.multiplyScalar(-1);
  const localXInWorld = new THREE.Vector3().crossVectors(faceDirection, localZInWorld).normalize();
  localZInWorld.crossVectors(localXInWorld, faceDirection).normalize();

  const targetWorldQuaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(localXInWorld, faceDirection, localZInWorld),
  );
  if (surface.parent) {
    const parentWorldQuaternion = new THREE.Quaternion();
    surface.parent.getWorldQuaternion(parentWorldQuaternion);
    surface.quaternion.copy(parentWorldQuaternion.invert().multiply(targetWorldQuaternion)).normalize();
  } else {
    surface.quaternion.copy(targetWorldQuaternion).normalize();
  }
  surface.updateMatrix();
  return true;
}
