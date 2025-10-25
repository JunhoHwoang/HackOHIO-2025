import { Badge } from '@/components/ui/badge';
import { PermitType } from '@/types/parking';

interface PermitFilterProps {
  selected: PermitType[];
  onChange: (permits: PermitType[]) => void;
}

const allPermits: PermitType[] = ['A', 'B', 'C', 'West Campus', 'Visitor', 'Staff'];

const PermitFilter = ({ selected, onChange }: PermitFilterProps) => {
  const togglePermit = (permit: PermitType) => {
    if (selected.includes(permit)) {
      onChange(selected.filter(p => p !== permit));
    } else {
      onChange([...selected, permit]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allPermits.map(permit => (
        <Badge
          key={permit}
          variant={selected.includes(permit) ? 'default' : 'outline'}
          className="cursor-pointer transition-all hover:scale-105 active:scale-95"
          onClick={() => togglePermit(permit)}
        >
          {permit}
        </Badge>
      ))}
    </div>
  );
};

export default PermitFilter;
