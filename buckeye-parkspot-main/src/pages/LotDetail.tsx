import { useParams, useNavigate } from 'react-router-dom';
import { mockLots, mockC5Stalls } from '@/data/mockLots';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StallOverlay from '@/components/StallOverlay';
import { ArrowLeft, MapPin, Clock, DollarSign, Navigation, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Stall } from '@/types/parking';

const LotDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lot = mockLots.find((l) => l.id === id);
  const [selectedStall, setSelectedStall] = useState<Stall | null>(null);

  if (!lot) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Lot Not Found</h2>
          <p className="text-muted-foreground mb-4">The parking lot you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/')}>Back to Map</Button>
        </Card>
      </div>
    );
  }

  const occupancyRate = lot.capacity > 0 ? (lot.occupied / lot.capacity) * 100 : 0;
  const stalls = lot.id === 'carmack-5' ? mockC5Stalls : [];

  const getTimeAgo = (isoString: string): string => {
    const now = new Date();
    const then = new Date(isoString);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hours ago`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-3">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Map
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{lot.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>{lot.code}</span>
              {lot.distance && (
                <>
                  <span>•</span>
                  <span>{lot.distance}m away</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Occupancy Overview */}
        <Card className="p-6">
          <div className="grid md:grid-cols-3 gap-6 mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-success">{lot.open}</div>
              <div className="text-sm text-muted-foreground">Open Spots</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-destructive">{lot.occupied}</div>
              <div className="text-sm text-muted-foreground">Occupied</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{lot.capacity}</div>
              <div className="text-sm text-muted-foreground">Total Capacity</div>
            </div>
          </div>
          <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all ${
                occupancyRate > 90 ? 'bg-destructive' : occupancyRate > 70 ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Last updated: {getTimeAgo(lot.updatedAt)}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {lot.source === 'camera' ? '📹 Camera' : lot.source === 'osu_feed' ? '🔗 OSU Feed' : '✋ Manual'}
            </Badge>
          </div>
        </Card>

        {/* Bird's Eye View (if available) */}
        {stalls.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Bird's Eye View</h2>
            <div className="relative bg-muted rounded-lg overflow-hidden" style={{ height: '400px' }}>
              {/* Placeholder lot image */}
              <div className="w-full h-full bg-gradient-to-br from-muted to-secondary flex items-center justify-center">
                <span className="text-muted-foreground text-sm">Lot Image</span>
              </div>
              <StallOverlay
                stalls={stalls}
                imageWidth={600}
                imageHeight={400}
                onStallClick={setSelectedStall}
              />
            </div>
            <div className="mt-4 flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-success/50 border-2 border-success"></div>
                <span>Open</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-destructive/50 border-2 border-destructive"></div>
                <span>Occupied</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-neutral/50 border-2 border-neutral"></div>
                <span>Unknown</span>
              </div>
            </div>
            {selectedStall && (
              <Card className="mt-4 p-4 bg-secondary">
                <h3 className="font-semibold mb-2">Stall {selectedStall.id}</h3>
                <div className="text-sm space-y-1">
                  <div>Status: <Badge variant={selectedStall.status === 'open' ? 'success' : 'destructive'}>{selectedStall.status}</Badge></div>
                  <div>Permits: {selectedStall.permit.join(', ')}</div>
                  {selectedStall.confidence && <div>Confidence: {(selectedStall.confidence * 100).toFixed(0)}%</div>}
                </div>
              </Card>
            )}
          </Card>
        )}

        {/* Lot Details Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Permits & Payment */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Permits & Payment</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Accepted Permits</label>
                <div className="flex gap-2 flex-wrap mt-2">
                  {lot.permits.map((permit) => (
                    <Badge key={permit} variant="secondary">{permit}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Payment Methods</label>
                <div className="flex gap-2 flex-wrap mt-2">
                  {lot.payment.map((method) => (
                    <Badge key={method} variant="outline">{method}</Badge>
                  ))}
                </div>
              </div>
              {lot.pricing && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Pricing
                  </label>
                  <div className="text-sm space-y-1">
                    {lot.pricing.hourly && <div>Hourly: ${lot.pricing.hourly.toFixed(2)}</div>}
                    {lot.pricing.max && <div>Daily Max: ${lot.pricing.max.toFixed(2)}</div>}
                    {lot.pricing.notes && (
                      <div className="text-muted-foreground text-xs mt-2">{lot.pricing.notes}</div>
                    )}
                  </div>
                </div>
              )}
              {lot.parkMobileZone && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={`https://www.parkmobile.io/`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Pay with ParkMobile (Zone {lot.parkMobileZone})
                  </a>
                </Button>
              )}
            </div>
          </Card>

          {/* Access Points */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Entrances & Exits</h2>
            <div className="space-y-3">
              {lot.entrances?.map((entrance) => (
                <div key={entrance.id} className="p-3 bg-secondary rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Navigation className="w-4 h-4 text-success" />
                        <span className="font-medium text-sm">{entrance.name}</span>
                      </div>
                      {entrance.address && (
                        <p className="text-xs text-muted-foreground">{entrance.address}</p>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${entrance.location.lat},${entrance.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
              {lot.exits?.map((exit) => (
                <div key={exit.id} className="p-3 bg-secondary rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Navigation className="w-4 h-4 text-destructive" />
                        <span className="font-medium text-sm">{exit.name}</span>
                      </div>
                      {exit.address && (
                        <p className="text-xs text-muted-foreground">{exit.address}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LotDetail;
