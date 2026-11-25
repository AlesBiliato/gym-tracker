// Genera los iconos PNG de la PWA sin dependencias (codificador PNG mínimo).
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x / size, y / size)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
const rect = (u, v, x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1
// Mancuerna centrada dentro de la zona segura (maskable).
const draw = (u, v) => {
  if (rect(u, v, 0.18, 0.40, 0.26, 0.60) || rect(u, v, 0.74, 0.40, 0.82, 0.60)) return [56, 189, 248]
  if (rect(u, v, 0.26, 0.47, 0.74, 0.53)) return [226, 232, 240]
  if (rect(u, v, 0.12, 0.45, 0.18, 0.55) || rect(u, v, 0.82, 0.45, 0.88, 0.55)) return [226, 232, 240]
  return [11, 18, 32]
}
writeFileSync('public/icon-192.png', png(192, draw))
writeFileSync('public/icon-512.png', png(512, draw))
writeFileSync('public/apple-touch-icon.png', png(180, draw))
console.log('Iconos generados en public/')
