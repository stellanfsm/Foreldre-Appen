import type { PersonId } from '../types'
import { useFamily } from '../context/FamilyContext'
import { FamilyFilterBar as NewFamilyFilterBar } from './ui/FamilyChip'

interface FamilyFilterBarProps {
  selectedPersonIds: PersonId[]
  onFilterChange: (ids: PersonId[]) => void
  /** Person id that represents the current user ("deg") */
  mePersonId?: PersonId | null
}

export function FamilyFilterBar({ selectedPersonIds, onFilterChange, mePersonId }: FamilyFilterBarProps) {
  const { people } = useFamily()

  if (people.length === 0) {
    return (
      <div className="px-4 pb-2 pt-2 text-center">
        <p className="text-[13px] text-neutral-400">
          Ingen familiemedlemmer ennå. Gå til <span className="font-medium text-neutral-600">Innstillinger</span> for å
          legge til foreldre og barn.
        </p>
      </div>
    )
  }

  // Map people to the new FamilyChip format with color variants
  const familyMembers = people.map((person, index) => {
    // Assign color variants based on index to ensure consistency
    const variants: Array<'mamma' | 'pappa' | 'ella' | 'bestemor' | 'default'> = ['mamma', 'pappa', 'ella', 'bestemor', 'default']
    return {
      id: person.id,
      name: person.name,
      variant: variants[index % variants.length],
    }
  })

  return (
    <NewFamilyFilterBar
      familyMembers={familyMembers}
      selectedIds={selectedPersonIds}
      onSelectionChange={onFilterChange}
      meId={mePersonId || undefined}
    />
  )
}
