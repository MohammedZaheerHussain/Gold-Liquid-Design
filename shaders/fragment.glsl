// ============================================
// FRAGMENT SHADER — Liquid Metal Material
// ============================================
// Premium glass/metal hybrid with controlled Fresnel,
// dark absorption core, and metallic highlights

uniform vec3 u_cameraPosition;
uniform vec3 u_keyLightPos;
uniform vec3 u_rimLightPos;
uniform vec3 u_keyLightColor;
uniform vec3 u_rimLightColor;
uniform float u_keyLightIntensity;
uniform float u_rimLightIntensity;
uniform float u_fresnelPower;
uniform float u_fresnelBias;
uniform float u_absorption;
uniform float u_time;

varying vec3 v_normal;
varying vec3 v_position;
varying vec3 v_worldPosition;
varying float v_displacement;

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Schlick Fresnel approximation with controlled tightness
float fresnel(vec3 viewDir, vec3 normal, float power, float bias) {
    float NdotV = max(dot(normal, viewDir), 0.0);
    float fresnel = bias + (1.0 - bias) * pow(1.0 - NdotV, power);
    return clamp(fresnel, 0.0, 1.0);
}

// Smooth metallic specular
float specular(vec3 lightDir, vec3 viewDir, vec3 normal, float roughness) {
    vec3 halfDir = normalize(lightDir + viewDir);
    float NdotH = max(dot(normal, halfDir), 0.0);
    float spec = pow(NdotH, 1.0 / (roughness * roughness + 0.001));
    return spec;
}

// Procedural environment gradient (no textures)
vec3 environmentGradient(vec3 reflectDir) {
    // Dark institutional gradient
    float y = reflectDir.y * 0.5 + 0.5;
    
    // Deep charcoal to navy transition
    vec3 bottomColor = vec3(0.02, 0.02, 0.03);   // Near black
    vec3 midColor = vec3(0.04, 0.045, 0.06);     // Dark charcoal
    vec3 topColor = vec3(0.06, 0.065, 0.09);     // Deep navy hint
    
    vec3 env = mix(bottomColor, midColor, smoothstep(0.0, 0.5, y));
    env = mix(env, topColor, smoothstep(0.5, 1.0, y));
    
    // Subtle warm highlight zone (simulates studio softbox)
    float highlightZone = smoothstep(0.6, 0.9, y) * smoothstep(0.3, 0.0, abs(reflectDir.x - 0.3));
    env += vec3(0.08, 0.07, 0.05) * highlightZone * 0.5;
    
    return env;
}

// ============================================
// MAIN FRAGMENT
// ============================================

void main() {
    // Normalize interpolated normal
    vec3 normal = normalize(v_normal);
    
    // View direction
    vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);
    
    // Reflection vector for environment
    vec3 reflectDir = reflect(-viewDir, normal);
    
    // ----------------------------------------
    // BASE COLOR — Dark Absorption Core
    // ----------------------------------------
    // Deep, near-black base with subtle color variation
    vec3 coreColor = vec3(0.015, 0.018, 0.025);
    
    // Depth-based absorption (darker toward center)
    float depth = 1.0 - abs(v_displacement) * 2.0;
    depth = clamp(depth, 0.0, 1.0);
    vec3 absorbedColor = coreColor * (1.0 - depth * u_absorption * 0.5);
    
    // ----------------------------------------
    // FRESNEL — Tight Edge Glow
    // ----------------------------------------
    float fresnelTerm = fresnel(viewDir, normal, u_fresnelPower, u_fresnelBias);
    
    // Edge color: cool metallic with subtle gold
    vec3 edgeColor = vec3(0.12, 0.13, 0.16);          // Cool silver base
    vec3 goldTint = vec3(0.15, 0.12, 0.08) * 0.3;     // Subtle warm accent
    vec3 blueTint = vec3(0.08, 0.10, 0.14) * 0.2;     // Cool accent
    
    // Mix edge colors based on view angle
    float angleMix = dot(normal, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    edgeColor = mix(edgeColor + blueTint, edgeColor + goldTint, angleMix);
    
    // ----------------------------------------
    // ENVIRONMENT REFLECTION
    // ----------------------------------------
    vec3 envColor = environmentGradient(reflectDir);
    
    // ----------------------------------------
    // KEY LIGHT — Main Illumination
    // ----------------------------------------
    vec3 keyLightDir = normalize(u_keyLightPos - v_worldPosition);
    float keyDiffuse = max(dot(normal, keyLightDir), 0.0);
    keyDiffuse = pow(keyDiffuse, 1.5); // Slightly harder falloff
    
    float keySpec = specular(keyLightDir, viewDir, normal, 0.15);
    keySpec = pow(keySpec, 2.0) * 0.8; // Tight metallic highlight
    
    vec3 keyContribution = u_keyLightColor * u_keyLightIntensity * (keyDiffuse * 0.15 + keySpec);
    
    // ----------------------------------------
    // RIM LIGHT — Subtle Edge Definition
    // ----------------------------------------
    vec3 rimLightDir = normalize(u_rimLightPos - v_worldPosition);
    float rimDiffuse = max(dot(normal, rimLightDir), 0.0);
    
    // Rim only visible at grazing angles
    float rimMask = 1.0 - max(dot(viewDir, normal), 0.0);
    rimMask = pow(rimMask, 3.0);
    
    vec3 rimContribution = u_rimLightColor * u_rimLightIntensity * rimDiffuse * rimMask * 0.4;
    
    // ----------------------------------------
    // COMPOSITE — Final Color Assembly
    // ----------------------------------------
    // Start with absorbed core
    vec3 finalColor = absorbedColor;
    
    // Add environment reflection (subtle)
    finalColor += envColor * fresnelTerm * 0.6;
    
    // Add fresnel edge glow (controlled, not bubble-like)
    finalColor += edgeColor * fresnelTerm * fresnelTerm * 0.4;
    
    // Add lighting contributions
    finalColor += keyContribution;
    finalColor += rimContribution;
    
    // ----------------------------------------
    // SUBTLE SURFACE VARIATION
    // ----------------------------------------
    // Very subtle variation based on displacement
    float surfaceVar = v_displacement * 0.5 + 0.5;
    finalColor *= 0.95 + surfaceVar * 0.1;
    
    // ----------------------------------------
    // TONE MAPPING & OUTPUT
    // ----------------------------------------
    // Simple Reinhard tone mapping
    finalColor = finalColor / (finalColor + vec3(1.0));
    
    // Slight contrast boost
    finalColor = pow(finalColor, vec3(1.05));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
