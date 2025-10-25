import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MapView from '@/components/MapView';
import LotCard from '@/components/LotCard';
import PermitFilter from '@/components/PermitFilter';
import { mockLots } from '@/data/mockLots';
import { Lot, PermitType } from '@/types/parking';
import { Search, MapPin, Filter } from 'lucide-react';
import { Card } from '@/components/ui/card';

const Index = () => {
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>(mockLots);
  const [filteredLots, setFilteredLots] = useState<Lot[]>(mockLots);
  const [selectedPermits, setSelectedPermits] = useState<PermitType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>();
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    // Request geolocation
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Geolocation denied or unavailable:', error);
          // Default to OSU campus center
          setUserLocation({ lat: 40.0067, lng: -83.0305 });
        }
      );
    } else {
      // Default to OSU campus center
      setUserLocation({ lat: 40.0067, lng: -83.0305 });
    }
  }, []);

  useEffect(() => {
    let filtered = lots;

    // Filter by permit
    if (selectedPermits.length > 0) {
      filtered = filtered.filter((lot) =>
        lot.permits.some((permit) => selectedPermits.includes(permit))
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (lot) =>
          lot.name.toLowerCase().includes(query) ||
          lot.code.toLowerCase().includes(query)
      );
    }

    // Sort by distance if user location is available
    if (userLocation) {
      filtered = [...filtered].sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    setFilteredLots(filtered);
  }, [selectedPermits, searchQuery, lots, userLocation]);

  const handleLotClick = (lotId: string) => {
    navigate(`/lot/${lotId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                OSU Smart Parking
              </h1>
              <p className="text-sm text-muted-foreground">Find your spot in seconds</p>
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search lots by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Permit Filters */}
          {showFilters && (
            <Card className="mt-4 p-4">
              <label className="text-sm font-medium mb-2 block">Filter by Permit Type</label>
              <PermitFilter selected={selectedPermits} onChange={setSelectedPermits} />
            </Card>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Map */}
          <div className="h-[500px] lg:h-[calc(100vh-200px)] lg:sticky lg:top-24">
            <MapView
              lots={filteredLots}
              onLotClick={handleLotClick}
              userLocation={userLocation}
            />
          </div>

          {/* Lot List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Nearby Lots ({filteredLots.length})
              </h2>
              {userLocation && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Sorted by distance</span>
                </div>
              )}
            </div>

            {filteredLots.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-2">No lots found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your filters or search query
                </p>
              </Card>
            ) : (
              filteredLots.map((lot) => (
                <LotCard key={lot.id} lot={lot} onClick={() => handleLotClick(lot.id)} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
