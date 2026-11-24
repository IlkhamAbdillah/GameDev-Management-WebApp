import PageHeader from '../components/PageHeader'

export default function ComingSoonPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title={title} />
      <div className="grid place-items-center rounded-2xl border border-dashed border-line py-24 text-center text-sm text-slate-400">
        Coming in {phase}.
      </div>
    </div>
  )
}
