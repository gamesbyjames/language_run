import * as THREE from 'three';

/** Sky dome, fog, lights and the misty abyss under the path. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private abyss: THREE.Mesh;
  private sunOffset = new THREE.Vector3(-18, 30, -12);

  constructor(scene: THREE.Scene) {
    const haze = new THREE.Color(0xb9c9a4);
    scene.background = haze;
    scene.fog = new THREE.Fog(haze, 30, 150);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(0x6f9fd0) },
          horizon: { value: haze },
          bottom: { value: new THREE.Color(0x40563a) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, bottom, pow(-h, 0.5));
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x4a5a32, 1.6));

    this.sun = new THREE.DirectionalLight(0xffe6c4, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 28;
    sc.bottom = -28;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.abyss = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0x2c4a2c, roughness: 1 }),
    );
    this.abyss.rotation.x = -Math.PI / 2;
    this.abyss.position.y = -40;
    scene.add(this.abyss);
  }

  update(focus: THREE.Vector3, camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.sunOffset);
    this.abyss.position.x = focus.x;
    this.abyss.position.z = focus.z;
  }
}
