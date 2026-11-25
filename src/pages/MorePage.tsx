import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { exportAll, getSettings, saveImport, saveSettings } from '../db/repo'
import { buildImport, type ImportResult, type RawHistory } from '../domain/importer'
import { formatDateTime, todayISO } from '../domain/format'
import { checkForUpdate } from '../update'
import { PageHeader } from '../components/ui'

function applyTheme(t: 'auto' | 'claro' | 'oscuro') {
  const key = t === 'claro' ? 'light' : t === 'oscuro' ? 'dark' : 'auto'
  try { localStorage.setItem('theme', key) } catch { /* ignore */ }
  const dark = key === 'dark' || (key === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

function VersionCard() {
  const [state, setState] = useState<'idle' | 'checking' | 'latest' | 'new'>('idle')
  const check = async () => {
    setState('checking')
    setState((await checkForUpdate()) ? 'new' : 'latest')
  }
  return (
    <div className="card space-y-2">
      <p className="font-bold">Versión</p>
      <p className="text-sm text-slate-500">
        {__APP_VERSION__} <span className="tabular-nums">({__APP_COMMIT__})</span> · desplegada el {formatDateTime(__BUILD_DATE__)}
      </p>
      <button className="btn btn-soft btn-sm w-full" onClick={check} disabled={state === 'checking'}>
        {state === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
      </button>
      {state === 'latest' && <p className="text-sm text-emerald-600 dark:text-emerald-400">Tienes la última versión.</p>}
      {state === 'new' && <p className="text-sm text-sky-600 dark:text-sky-400">Hay una versión nueva: pulsa «Actualizar» en el aviso de arriba.</p>}
    </div>
  )
}

export default function MorePage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const counts = useLiveQuery(async () => ({
    sesiones: await db.sessions.count(), series: await db.sets.count(), ejercicios: await db.exercises.count(), peso: await db.bodyWeights.count(),
  }), [])
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [msg, setMsg] = useState('')

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const raw = JSON.parse(await f.text()) as RawHistory
      const catalog = await db.exercises.toArray()
      setPreview(buildImport(raw, catalog))
      setMsg('')
    } catch (e) {
      setPreview(null)
      setMsg(`No se pudo leer el archivo: ${(e as Error).message}`)
    }
  }

  const confirm = async () => {
    if (!preview) return
    await saveImport(preview)
    setMsg(`Importado: ${preview.stats.sessions} sesiones, ${preview.stats.exercises} ejercicios, ${preview.bodyWeights.length} pesos corporales.`)
    setPreview(null)
  }

  const download = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gym-tracker-copia-${todayISO()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  return (
    <>
      <PageHeader title="Más" />
      <div className="space-y-4 px-4">
        <div className="card">
          <p className="mb-2 font-bold">Apariencia</p>
          <div className="flex gap-2">
            {(['auto', 'claro', 'oscuro'] as const).map((t) => (
              <button key={t} className={`chip flex-1 justify-center ${settings?.theme === t ? 'chip-on' : ''}`}
                onClick={async () => { await saveSettings({ theme: t }); applyTheme(t) }}>{t}</button>
            ))}
          </div>
        </div>

        <div className="card space-y-3">
          <p className="font-bold">Importar historial</p>
          <p className="text-sm text-slate-500">Archivo <code>historial-gimnasio-alessandro.json</code>. Los nombres se normalizan al catálogo; los que no coinciden se crean como ejercicios nuevos.</p>
          <label className="btn btn-primary w-full">
            Elegir archivo…
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {preview && (
            <div className="space-y-2 rounded-2xl bg-slate-100 p-3 dark:bg-slate-800">
              <p className="font-semibold">{preview.stats.sessions} sesiones · {preview.stats.exercises} ejercicios ({preview.stats.matched} reconocidos, {preview.stats.created} nuevos) · {preview.bodyWeights.length} pesos</p>
              <p className="text-sm">Con repeticiones/RIR reales extraídos: {preview.stats.withReps}</p>
              {preview.warnings.length > 0 && (
                <details className="text-sm"><summary className="font-semibold">{preview.warnings.length} avisos</summary>
                  <ul className="mt-1 list-disc pl-5">{preview.warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}</ul></details>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={confirm}>Importar</button>
                <button className="btn btn-soft" onClick={() => setPreview(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {msg && <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{msg}</p>}
        </div>

        <div className="card space-y-3">
          <p className="font-bold">Copia de seguridad</p>
          <p className="text-sm text-slate-500">Tus datos viven solo en este móvil. Descarga una copia de vez en cuando. (Exportación completa y resumen para Claude: fase 5.)</p>
          <button className="btn btn-soft w-full" onClick={download}>Descargar copia (JSON)</button>
        </div>

        <VersionCard />

        {counts && <p className="text-center text-sm text-slate-500">{counts.ejercicios} ejercicios · {counts.sesiones} sesiones · {counts.series} series · {counts.peso} pesos</p>}
      </div>
    </>
  )
}
