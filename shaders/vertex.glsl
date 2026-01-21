// ============================================
// VERTEX SHADER — Liquid Hero Deformation
// ============================================
// Implements viscous, gravity-affected liquid motion
// using 4D simplex noise for seamless time evolution

uniform float u_time;
uniform float u_noiseScale;
uniform float u_amplitude;
uniform float u_viscosity;

varying vec3 v_normal;
varying vec3 v_position;
varying vec3 v_worldPosition;
varying float v_displacement;

// ============================================
// SIMPLEX NOISE IMPLEMENTATION (4D)
// ============================================
// Based on Stefan Gustavson's implementation

vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

float mod289(float x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 10.0) * x);
}

float permute(float x) {
    return mod289(((x * 34.0) + 10.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float taylorInvSqrt(float r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p, s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
}

#define F4 0.309016994374947451

float snoise(vec4 v) {
    const vec4 C = vec4(
        0.138196601125011,   // (5 - sqrt(5))/20  G4
        0.276393202250021,   // 2 * G4
        0.414589803375032,   // 3 * G4
        -0.447213595499958   // -1 + 4 * G4
    );

    vec4 i  = floor(v + dot(v, vec4(F4)));
    vec4 x0 = v - i + dot(i, C.xxxx);

    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    i = mod289(i);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute(permute(permute(permute(
        i.w + vec4(i1.w, i2.w, i3.w, 1.0))
      + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
      + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
      + i.x + vec4(i1.x, i2.x, i3.x, 1.0));

    vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);

    vec4 p0 = grad4(j0,   ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4,p4));

    vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;

    return 49.0 * (
        dot(m0*m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
        dot(m1*m1, vec2(dot(p3, x3), dot(p4, x4)))
    );
}

// ============================================
// FRACTAL BROWNIAN MOTION (FBM)
// ============================================
// Multi-octave noise for organic complexity

float fbm(vec4 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < 4; i++) {
        if (i >= octaves) break;
        value += amplitude * snoise(p * frequency);
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    
    return value / maxValue;
}

// ============================================
// MAIN VERTEX DEFORMATION
// ============================================

void main() {
    // Slow time progression for viscous feel
    float slowTime = u_time * u_viscosity;
    
    // Base position
    vec3 pos = position;
    vec3 norm = normalize(normal);
    
    // ----------------------------------------
    // DIRECTIONAL BIAS — Gravity Effect
    // ----------------------------------------
    // Vertical anisotropy: more displacement at bottom
    float verticalBias = 1.0 - (pos.y * 0.3 + 0.5); // Heavier at bottom
    verticalBias = clamp(verticalBias, 0.6, 1.2);
    
    // Horizontal compression for grounded feel
    float horizontalScale = 1.0 + (1.0 - abs(pos.y)) * 0.15;
    
    // ----------------------------------------
    // PRIMARY DEFORMATION — Low Frequency
    // ----------------------------------------
    vec4 noiseInput = vec4(
        pos.x * u_noiseScale * horizontalScale,
        pos.y * u_noiseScale * 0.7, // Vertical compression
        pos.z * u_noiseScale * horizontalScale,
        slowTime
    );
    
    float primaryNoise = fbm(noiseInput, 3);
    
    // ----------------------------------------
    // SECONDARY DETAIL — Higher Frequency
    // ----------------------------------------
    vec4 detailInput = vec4(
        pos * u_noiseScale * 2.5,
        slowTime * 1.3
    );
    float detailNoise = snoise(detailInput) * 0.15;
    
    // ----------------------------------------
    // COMBINED DISPLACEMENT
    // ----------------------------------------
    float displacement = (primaryNoise + detailNoise) * u_amplitude * verticalBias;
    
    // Apply displacement along normal
    vec3 newPosition = pos + norm * displacement;
    
    // ----------------------------------------
    // OUTPUT
    // ----------------------------------------
    v_displacement = displacement;
    v_normal = normalize(normalMatrix * norm);
    v_position = newPosition;
    v_worldPosition = (modelMatrix * vec4(newPosition, 1.0)).xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
