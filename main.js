// ============================================
// LIQUID HERO — Reference Match v2
// ============================================
// Smooth surface, navy blue zone, living motion
// Fixed faceted geometry issue

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ============================================
// VIGNETTE SHADER
// ============================================
const VignetteShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'offset': { value: 0.85 },
        'darkness': { value: 1.1 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 uv = (vUv - vec2(0.5)) * 2.0;
            float dist = length(uv);
            float vignette = smoothstep(offset + 0.5, offset - 0.3, dist);
            vignette = mix(1.0 - darkness * 0.3, 1.0, vignette);
            texel.rgb *= vignette;
            gl_FragColor = texel;
        }
    `
};

// ============================================
// STARFIELD SHADER
// ============================================
const StarfieldShader = {
    uniforms: {
        'u_time': { value: 0 },
        'u_resolution': { value: new THREE.Vector2(1, 1) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float u_time;
        uniform vec2 u_resolution;
        varying vec2 vUv;
        
        float hash(vec2 p) {
            p = fract(p * vec2(234.34, 435.345));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
        }
        
        float stars(vec2 uv, float scale, float time, float baseIntensity) {
            vec2 gv = fract(uv * scale) - 0.5;
            vec2 id = floor(uv * scale);
            float star = 0.0;
            
            for(int y = -1; y <= 1; y++) {
                for(int x = -1; x <= 1; x++) {
                    vec2 offset = vec2(float(x), float(y));
                    vec2 cellId = id + offset;
                    float n = hash(cellId);
                    
                    if(n > 0.93) {
                        vec2 starPos = vec2(n, hash(cellId + 1.0)) - 0.5;
                        vec2 diff = gv - offset - starPos;
                        float d = length(diff);
                        
                        float twinkleSpeed = 0.08 + hash(cellId * 2.0) * 0.2;
                        float twinklePhase = hash(cellId * 3.0) * 6.28;
                        float twinkle = sin(time * twinkleSpeed + twinklePhase) * 0.5 + 0.5;
                        twinkle = 0.75 + twinkle * 0.25;
                        
                        float brightness = hash(cellId * 4.0) * 0.4 + 0.3;
                        float starGlow = baseIntensity * brightness * twinkle / (d * 20.0 + 0.12);
                        starGlow = pow(starGlow, 1.5);
                        star += starGlow;
                    }
                }
            }
            return star;
        }
        
        void main() {
            vec2 uv = vUv;
            vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
            uv = uv * aspect;
            
            // Base sky colors - darker, more atmospheric
            vec3 skyTop = vec3(0.035, 0.03, 0.06);
            vec3 skyMid = vec3(0.015, 0.015, 0.035);
            vec3 skyBottom = vec3(0.008, 0.008, 0.018);
            
            vec3 color = mix(skyBottom, skyMid, smoothstep(0.0, 0.5, vUv.y));
            color = mix(color, skyTop, smoothstep(0.5, 1.0, vUv.y));
            
            // ========== SUNLIGHT ATMOSPHERIC GLOW (from bottom-right, where blob is) ==========
            // Main warm sunlight glow - emanates from bottom-right corner
            vec2 sunCenter = vec2(0.7, -0.2);  // Below and to the right
            float sunDist = distance(vUv, sunCenter);
            float sunGlow = 1.0 / (sunDist * 1.8 + 0.4);
            sunGlow = pow(sunGlow, 1.6) * 0.35;
            
            // Warm golden/orange sunlight colors
            vec3 sunColorInner = vec3(0.45, 0.28, 0.08);  // Deep amber
            vec3 sunColorOuter = vec3(0.25, 0.12, 0.04);  // Soft orange
            vec3 sunLight = mix(sunColorOuter, sunColorInner, smoothstep(1.2, 0.3, sunDist));
            color += sunLight * sunGlow;
            
            // Secondary glow - softer, wider ambient warmth
            float ambientWarmth = 1.0 / (sunDist * 0.9 + 0.8);
            ambientWarmth = pow(ambientWarmth, 1.2) * 0.12;
            color += vec3(0.18, 0.08, 0.02) * ambientWarmth;
            
            // ========== PURPLE/BLUE ATMOSPHERE (top-left) ==========
            float topLeft = (1.0 - vUv.x) * vUv.y;
            vec3 purpleAtmosphere = vec3(0.06, 0.035, 0.10);
            color = mix(color, purpleAtmosphere, topLeft * 0.45);
            
            // Subtle blue atmosphere in upper areas
            float upperAtmosphere = smoothstep(0.4, 0.9, vUv.y) * (1.0 - vUv.x * 0.5);
            color += vec3(0.02, 0.025, 0.055) * upperAtmosphere * 0.5;
            
            // ========== STARS (subtle, behind atmosphere) ==========
            float starLayer1 = stars(uv, 28.0, u_time, 0.4);
            float starLayer2 = stars(uv + 100.0, 45.0, u_time * 0.75, 0.2);
            
            // Stars are dimmer in areas with more atmospheric glow
            float starDim = 1.0 - smoothstep(0.5, 1.5, sunGlow * 3.0);
            color += vec3(0.9, 0.88, 0.82) * starLayer1 * 0.4 * starDim;
            color += vec3(0.82, 0.85, 0.9) * starLayer2 * 0.3 * starDim;
            
            gl_FragColor = vec4(color, 1.0);
        }
    `
};

// ============================================
// VERTEX SHADER — Smooth Normals + Breathing
// ============================================
const vertexShader = `
uniform float u_time;
uniform float u_amplitude;

varying vec3 v_normal;
varying vec3 v_worldPosition;
varying vec3 v_localPosition;
varying vec3 v_smoothNormal;

// Simplex noise for smooth deformation
vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permutev4(vec4 x) { return mod289v4(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrtv4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289v3(i);
    vec4 p = permutev4(permutev4(permutev4(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrtv4(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
    float slowTime = u_time * 0.08;  // FASTER animation (was 0.04)
    vec3 pos = position;
    vec3 norm = normalize(normal);
    
    // BREATHING MOTION — FASTER, organic
    float breathe = sin(slowTime * 12.0) * 0.08;
    float pulse = sin(slowTime * 10.0 + pos.y * 2.5) * 0.05;
    float sway = sin(slowTime * 7.0 + pos.x * 2.0) * 0.035;
    
    // Noise-based organic deformation
    float noise1 = snoise(pos * 0.8 + slowTime * 0.7) * 0.12;
    float noise2 = snoise(pos * 1.5 + slowTime * 0.5) * 0.06;
    
    // Vertical bias — more motion at top
    float vertBias = (pos.y + 1.0) * 0.4 + 0.5;
    
    float displacement = (breathe + pulse + sway + noise1 + noise2) * u_amplitude * vertBias;
    vec3 newPosition = pos + norm * displacement;
    
    v_normal = normalize(normalMatrix * norm);
    v_smoothNormal = v_normal;  // Use for smooth shading
    v_localPosition = pos;
    v_worldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

// ============================================
// FRAGMENT SHADER — Reference Match
// ============================================
const fragmentShader = `
uniform vec3 u_cameraPosition;
uniform float u_time;

varying vec3 v_normal;
varying vec3 v_worldPosition;
varying vec3 v_localPosition;
varying vec3 v_smoothNormal;

const float PI = 3.14159265359;

// Smooth GGX
float D_GGX(float NdotH, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float d = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d + 0.0001);
}

vec3 F_Schlick(float VdotH, vec3 F0) {
    return F0 + (1.0 - F0) * pow(max(1.0 - VdotH, 0.0), 5.0);
}

// Environment sampling - EXACT reference match
vec3 sampleEnv(vec3 R) {
    float y = R.y * 0.5 + 0.5;
    float x = atan(R.z, R.x) / (2.0 * PI) + 0.5;
    
    vec3 env = vec3(0.015, 0.015, 0.025);
    
    // Golden top zone
    float topZone = smoothstep(0.45, 0.92, y);
    env += vec3(0.6, 0.45, 0.18) * topZone;
    
    // Left ORANGE/GOLD (strong like reference)
    float leftWarm = smoothstep(0.5, 0.08, x) * smoothstep(0.0, 0.5, y);
    env += vec3(0.6, 0.35, 0.1) * leftWarm * 0.8;
    
    // Right BLUE/CYAN (visible like reference)
    float rightBlue = smoothstep(0.5, 0.95, x) * smoothstep(0.1, 0.6, y);
    env += vec3(0.12, 0.25, 0.65) * rightBlue * 0.6;
    
    // Bright top highlight (white/cream)
    float topHL = smoothstep(0.72, 0.99, y);
    env += vec3(1.0, 0.94, 0.8) * topHL * 0.9;
    
    return env;
}

void main() {
    vec3 N = normalize(v_smoothNormal);
    vec3 V = normalize(u_cameraPosition - v_worldPosition);
    vec3 R = reflect(-V, N);
    
    float NdotV = max(dot(N, V), 0.0);
    float edgeFactor = 1.0 - NdotV;
    
    // Position for color zones
    float yPos = v_localPosition.y;
    float xPos = v_localPosition.x;
    
    // ========== VISIBLE INTERNAL COLORS (like reference) ==========
    // Navy blue zone - visible in lower/center area
    float navyZone = smoothstep(0.6, -0.5, yPos);
    vec3 navyColor = vec3(0.02, 0.06, 0.18);      // BRIGHTER navy blue - visible!
    
    // Gold/warm zone - upper areas
    vec3 goldColor = vec3(0.25, 0.16, 0.05);      // Warm gold base
    
    // Blend internal colors
    vec3 internalColor = mix(goldColor, navyColor, navyZone);
    
    // Add depth variation based on view angle (glass-like)
    float depthFade = pow(NdotV, 0.8);
    vec3 deepShadow = vec3(0.01, 0.02, 0.05);
    internalColor = mix(deepShadow, internalColor, 0.5 + depthFade * 0.5);
    
    // ========== ENVIRONMENT REFLECTION (glass) ==========
    float glassFresnel = pow(edgeFactor, 2.0);
    vec3 envColor = sampleEnv(R);
    vec3 envReflection = envColor * glassFresnel * 1.2;
    
    // ========== BRIGHT RIM HIGHLIGHT (like reference) ==========
    // Visible white/cream rim band on top curve
    float rimBand = pow(edgeFactor, 8.0);
    float topMask = smoothstep(-0.2, 0.35, yPos);
    vec3 rimColor = vec3(1.0, 0.96, 0.88) * rimBand * topMask * 2.5;  // BRIGHTER
    
    // ========== LEFT EDGE - BRIGHT ORANGE GLOW (like reference) ==========
    // This is the prominent warm glow on the left edge
    float leftEdge = smoothstep(0.3, -0.7, xPos);
    float leftHeight = smoothstep(-0.6, 0.5, yPos);
    float leftFresnel = pow(edgeFactor, 1.8);
    float leftIntensity = leftEdge * leftHeight * leftFresnel;
    
    // Bright orange/gold light on left
    vec3 leftGlow = vec3(1.0, 0.65, 0.25) * leftIntensity * 1.8;  // BRIGHT orange
    
    // Additional soft warmth behind
    float leftSoft = smoothstep(0.5, -0.9, xPos) * leftHeight;
    vec3 leftWarm = vec3(0.6, 0.35, 0.1) * leftSoft * pow(edgeFactor, 2.5) * 0.8;
    
    // ========== RIGHT EDGE - BLUE/CYAN REFLECTION ==========
    float rightEdge = smoothstep(-0.1, 0.7, xPos);
    float rightMid = smoothstep(-0.3, 0.4, yPos) * (1.0 - smoothstep(0.5, 0.9, yPos));
    float rightFresnel = pow(edgeFactor, 2.2);
    float rightIntensity = rightEdge * rightMid * rightFresnel;
    vec3 rightGlow = vec3(0.15, 0.35, 0.7) * rightIntensity * 1.0;  // Blue reflection
    
    // ========== SPECULAR HIGHLIGHTS ==========
    vec3 L1 = normalize(vec3(-0.55, 0.8, 0.35));
    vec3 H1 = normalize(V + L1);
    float NdotH1 = max(dot(N, H1), 0.0);
    float NdotL1 = max(dot(N, L1), 0.0);
    float VdotH1 = max(dot(V, H1), 0.0);
    
    float D1 = D_GGX(NdotH1, 0.025);
    vec3 F1 = F_Schlick(VdotH1, vec3(1.0, 0.92, 0.75));
    vec3 spec1 = D1 * F1 * NdotL1 * vec3(1.0, 0.95, 0.85) * 1.2;
    
    // Secondary highlight
    vec3 L2 = normalize(vec3(0.5, 0.5, 0.5));
    vec3 H2 = normalize(V + L2);
    float NdotH2 = max(dot(N, H2), 0.0);
    float NdotL2 = max(dot(N, L2), 0.0);
    float D2 = D_GGX(NdotH2, 0.05);
    vec3 spec2 = D2 * NdotL2 * vec3(0.9, 0.85, 0.7) * 0.25;
    
    // ========== EDGE DEFINITION ==========
    float edgeDefine = pow(edgeFactor, 3.5);
    vec3 edgeHighlight = vec3(0.6, 0.5, 0.32) * edgeDefine * 0.35;
    
    // ========== COMPOSITE ==========
    vec3 finalColor = internalColor * 0.35;       // Visible internal colors
    finalColor += envReflection;                  // Glass reflections
    finalColor += rimColor;                       // Bright rim band
    finalColor += leftGlow;                       // Orange left glow
    finalColor += leftWarm;                       // Soft warmth
    finalColor += rightGlow;                      // Blue right
    finalColor += spec1;                          // Main specular
    finalColor += spec2;                          // Secondary specular
    finalColor += edgeHighlight;                  // Edge definition
    
    // ========== TONE MAPPING ==========
    float a = 2.4, b = 0.025, c = 2.2, d = 0.58, e = 0.13;
    finalColor = clamp((finalColor * (a * finalColor + b)) / (finalColor * (c * finalColor + d) + e), 0.0, 1.0);
    
    // Subtle warmth
    finalColor = pow(finalColor, vec3(0.9, 0.95, 1.0));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ============================================
// SCENE
// ============================================
class LiquidHero {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.clock = new THREE.Clock();

        this.init();
        this.createStarfield();
        this.createGeometry();
        this.setupPostProcessing();
        this.animate();

        window.addEventListener('resize', () => this.onResize());
    }

    init() {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.set(0, 0, 5.0);
        this.camera.lookAt(0, -0.8, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x020204, 1);
        this.container.appendChild(this.renderer.domElement);
    }

    createStarfield() {
        const bgGeometry = new THREE.PlaneGeometry(40, 40);

        this.starfieldUniforms = {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        };

        const bgMaterial = new THREE.ShaderMaterial({
            uniforms: this.starfieldUniforms,
            vertexShader: StarfieldShader.vertexShader,
            fragmentShader: StarfieldShader.fragmentShader,
            depthWrite: false,
            depthTest: false
        });

        this.starfieldMesh = new THREE.Mesh(bgGeometry, bgMaterial);
        this.starfieldMesh.position.z = -15;
        this.starfieldMesh.renderOrder = -1;
        this.scene.add(this.starfieldMesh);
    }

    createGeometry() {
        // Use SphereGeometry for SMOOTH surface (no facets)
        const geometry = new THREE.SphereGeometry(1.0, 128, 128);
        const positionAttribute = geometry.getAttribute('position');
        const positions = positionAttribute.array;

        // Transform to egg shape
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i + 1];

            // Stretch vertically
            positions[i + 1] = y * 1.5;

            // Taper at top
            const taper = 1.0 - (y + 1.0) * 0.08;
            positions[i] *= taper;
            positions[i + 2] *= taper;

            // Slight bulge
            const bulge = 1.0 + (1.0 - Math.abs(y)) * 0.06;
            positions[i] *= bulge;
            positions[i + 2] *= bulge;
        }

        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();

        this.uniforms = {
            u_time: { value: 0 },
            u_amplitude: { value: 0.25 },
            u_cameraPosition: { value: this.camera.position }
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.FrontSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(0, -4.8, 0);
        this.mesh.scale.set(2.5, 2.5, 2.5);
        this.mesh.renderOrder = 1;

        this.scene.add(this.mesh);
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.28,   // Slightly increased for edge glow
            0.5,
            0.82
        );
        this.composer.addPass(bloomPass);

        const vignettePass = new ShaderPass(VignetteShader);
        this.composer.addPass(vignettePass);
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);

        this.starfieldUniforms.u_resolution.value.set(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const time = this.clock.getElapsedTime();
        this.uniforms.u_time.value = time;
        this.starfieldUniforms.u_time.value = time;

        this.composer.render();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LiquidHero();
});
