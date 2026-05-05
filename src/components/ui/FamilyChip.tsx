import { motion } from 'framer-motion'

interface FamilyChipProps {
  name: string
  variant?: 'mamma' | 'pappa' | 'ella' | 'bestemor' | 'default'
  isActive?: boolean
  isMe?: boolean
  onClick?: () => void
  className?: string
}

const variantStyles = {
  mamma: {
    background: '#d6efde', // mint-tint
    avatarBackground: '#4f9a73', // mint-accent
    avatarColor: '#fff',
  },
  pappa: {
    background: '#fbd9d6', // coral-tint
    avatarBackground: '#d27970', // coral-accent
    avatarColor: '#fff',
  },
  ella: {
    background: '#fbedc1', // sun-tint
    avatarBackground: '#c69a35', // sun-accent
    avatarColor: '#fff',
  },
  bestemor: {
    background: '#e1d8f0', // lilac-tint
    avatarBackground: '#9685c1', // lilac-accent
    avatarColor: '#fff',
  },
  default: {
    background: '#f1f5f9',
    avatarBackground: '#64748b',
    avatarColor: '#fff',
  },
}

export function FamilyChip({ 
  name, 
  variant = 'default', 
  isActive = false, 
  isMe = false, 
  onClick,
  className = '' 
}: FamilyChipProps) {
  const styles = variantStyles[variant]
  
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-[14px] py-1.5 rounded-full font-semibold text-[13px] text-neutral-600 cursor-pointer transition-all duration-120 touch-manipulation ${
        isMe ? 'ring-2 ring-offset-1 ring-primary-700/30' : ''
      } ${className}`}
      style={{
        backgroundColor: isActive ? styles.background : '#f1f5f9',
        color: isActive ? '#14211b' : '#7a7d77',
      }}
      whileTap={{ scale: 0.98 }}
      aria-pressed={isActive}
      aria-label={isMe ? `${name} (deg)` : `Filtrer på ${name}`}
    >
      <span 
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold"
        style={{
          backgroundColor: isActive ? styles.avatarBackground : 'rgba(255, 255, 255, 0.6)',
          color: isActive ? styles.avatarColor : '#3a4a42',
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span>{name}</span>
      {isMe && <span className="text-[10px] font-normal opacity-80">deg</span>}
    </motion.button>
  )
}

// Family filter bar component that uses the chips
interface FamilyFilterBarProps {
  familyMembers: Array<{ id: string; name: string; variant?: FamilyChipProps['variant'] }>
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  meId?: string
}

export function FamilyFilterBar({ familyMembers, selectedIds, onSelectionChange, meId }: FamilyFilterBarProps) {
  const handleToggle = (id: string) => {
    if (id === 'all') {
      onSelectionChange([])
      return
    }
    
    const newSelection = selectedIds.includes(id)
      ? selectedIds.filter(selectedId => selectedId !== id)
      : [...selectedIds, id]
    
    onSelectionChange(newSelection)
  }

  const isAllSelected = selectedIds.length === 0 || selectedIds.length === familyMembers.length

  return (
    <div className="flex max-w-full min-w-0 gap-2 overflow-x-auto pb-1 pt-2 scrollbar-none">
      <div className="flex shrink-0 px-1" />
      
      {/* "Alle" chip */}
      <FamilyChip
        name="Alle"
        isActive={isAllSelected}
        onClick={() => handleToggle('all')}
      />
      
      {/* Family member chips */}
      {familyMembers.map((member) => (
        <FamilyChip
          key={member.id}
          name={member.name}
          variant={member.variant}
          isActive={selectedIds.length === 0 || selectedIds.includes(member.id)}
          isMe={member.id === meId}
          onClick={() => handleToggle(member.id)}
        />
      ))}
      
      <div className="h-1 w-2 shrink-0" />
    </div>
  )
}
