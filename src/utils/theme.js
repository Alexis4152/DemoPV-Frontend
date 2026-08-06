// A partir de UN solo color elegido por el admin de la tienda, genera una rampa de
// tonos (claro→oscuro) y la aplica como variables CSS — así el resto de la app
// (que ya usa clases purple-50..900 de Tailwind) cambia de color sin tocar cada archivo.

const NEXORA_BLUE = '#155dea'

const RAMP_KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

// Cuánto se aleja cada tono de la lightness del color base (que se usa como el 600,
// el tono "principal" — botones, nav activo). Positivo = más claro, negativo = más oscuro.
const LIGHTNESS_OFFSET = {
  50: 45,
  100: 38,
  200: 28,
  300: 18,
  400: 9,
  500: 4,
  600: 0,
  700: -10,
  800: -18,
  900: -26,
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function isValidHex(hex) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex)
}

// "21 93 234" (espacio, no coma) — formato que necesita Tailwind para poder
// aplicar opacidad con rgb(var(--x) / <alpha>), ej. bg-purple-600/20.
function hexToRgbTriplet(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

// Devuelve { 50: '21 93 234', 100: '...', ..., 900: '...' } listo para variables CSS
export function generateRamp(baseHex) {
  const { h, s, l } = hexToHsl(baseHex)
  const ramp = {}
  for (const key of RAMP_KEYS) {
    const targetL = clamp(l + LIGHTNESS_OFFSET[key], 4, 97)
    const hex = key === 600 ? baseHex : hslToHex(h, s, targetL)
    ramp[key] = hexToRgbTriplet(hex)
  }
  return ramp
}

function applyRampToRoot(ramp, sidebarBg, sidebarBorder) {
  const root = document.documentElement
  for (const key of RAMP_KEYS) {
    root.style.setProperty(`--brand-${key}`, ramp[key])
  }
  root.style.setProperty('--brand-sidebar', sidebarBg)
  root.style.setProperty('--brand-sidebar-border', sidebarBorder)
}

// SUPER_ADMIN y el login siempre usan el azul Nexora fijo, sin importar
// el color que cualquier tienda haya elegido.
export function applyDefaultBrand() {
  const ramp = generateRamp(NEXORA_BLUE)
  applyRampToRoot(ramp, '#050b18', '#0d1b3d')
}

export function applyTiendaBrand(primaryColor) {
  const base = isValidHex(primaryColor) ? primaryColor : NEXORA_BLUE
  const ramp = generateRamp(base)
  const { h } = hexToHsl(base)
  // sidebar oscuro derivado del mismo tono, para que se sienta parte de la misma paleta
  const sidebarBg = hslToHex(h, 45, 6)
  const sidebarBorder = hslToHex(h, 45, 14)
  applyRampToRoot(ramp, sidebarBg, sidebarBorder)
}

export { NEXORA_BLUE }
