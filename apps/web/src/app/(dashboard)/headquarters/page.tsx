import { LotusHQ3D } from '@/components/hq/lotus-hq-3d'

export const metadata = {
  title: 'LOTUS HQ — Virtual Office 3D',
}

export default function HeadquartersPage() {
  return (
    <div className="h-[calc(100vh-4rem)] w-full overflow-hidden">
      <LotusHQ3D />
    </div>
  )
}
