import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lot, PermitType } from '@/types/parking';
import { MapPin, Clock, Car, Navigation } from 'lucide-react';

interface LotCardProps {
  lot: Lot;
  onClick?: () => void;
}

const LotCard = ({ lot, onClick }: LotCardProps) => {
  const occupancyRate = lot.capacity > 0 ? lot.occupied / lot.capacity : 0;
  const isBusy = occupancyRate > 0.8;
  const isAlmostFull = occupancyRate > 0.9;

  const getStatusColor = () => {
    if (isAlmostFull) return 'destructive';
    if (isBusy) return 'warning';
    return 'success';
  };

  const getStatusBg = () => {
    if (isAlmostFull) return 'bg-destructive/10';
    if (isBusy) return 'bg-warning/10';
    return 'bg-success/10';
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const getTimeAgo = (isoString: string): string => {
    const now = new Date();
    const then = new Date(isoString);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Live';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const isStale = () => {
    const diffMins = Math.floor((Date.now() - new Date(lot.updatedAt).getTime()) / 60000);
    return diffMins > 15;
  };

  return (
    <Card
      onClick={onClick}
      className="p-4 cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-card-foreground mb-1">{lot.name}</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            <span>{lot.code}</span>
            {lot.distance && (
              <>
                <span>•</span>
                <span>{formatDistance(lot.distance)}</span>
              </>
            )}
            {lot.walkingTime && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  {lot.walkingTime} min
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`rounded-lg p-3 mb-3 ${getStatusBg()}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Available Spots</span>
          </div>
          <Badge variant={getStatusColor()}>
            {lot.open} / {lot.capacity}
          </Badge>
        </div>
        <div className="w-full bg-background/50 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all ${
              isAlmostFull ? 'bg-destructive' : isBusy ? 'bg-warning' : 'bg-success'
            }`}
            style={{ width: `${occupancyRate * 100}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-1.5 flex-wrap">
          {lot.permits.slice(0, 3).map((permit) => (
            <Badge key={permit} variant="secondary" className="text-xs">
              {permit}
            </Badge>
          ))}
          {lot.permits.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{lot.permits.length - 3}
            </Badge>
          )}
        </div>
        <div className={`flex items-center gap-1 ${isStale() ? 'text-warning' : 'text-muted-foreground'}`}>
          <Clock className="w-3 h-3" />
          <span>{getTimeAgo(lot.updatedAt)}</span>
        </div>
      </div>
    </Card>
  );
};

export default LotCard;
