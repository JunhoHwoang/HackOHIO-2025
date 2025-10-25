import { Stall } from '@/types/parking';

interface StallOverlayProps {
  stalls: Stall[];
  imageWidth: number;
  imageHeight: number;
  onStallClick?: (stall: Stall) => void;
}

const StallOverlay = ({ stalls, imageWidth, imageHeight, onStallClick }: StallOverlayProps) => {
  const getStallColor = (status: Stall['status']) => {
    switch (status) {
      case 'open':
        return 'rgba(45, 164, 78, 0.5)'; // Green
      case 'occupied':
        return 'rgba(209, 67, 67, 0.5)'; // Red
      case 'unknown':
        return 'rgba(140, 140, 140, 0.5)'; // Gray
    }
  };

  const getStallStroke = (status: Stall['status']) => {
    switch (status) {
      case 'open':
        return '#2DA44E';
      case 'occupied':
        return '#D14343';
      case 'unknown':
        return '#8C8C8C';
    }
  };

  return (
    <svg
      width={imageWidth}
      height={imageHeight}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {stalls.map((stall) => {
        const points = stall.polygon.map(([x, y]) => `${x},${y}`).join(' ');

        return (
          <g key={stall.id}>
            <polygon
              points={points}
              fill={getStallColor(stall.status)}
              stroke={getStallStroke(stall.status)}
              strokeWidth="2"
              className="pointer-events-auto cursor-pointer transition-all hover:opacity-80"
              onClick={() => onStallClick?.(stall)}
            />
          </g>
        );
      })}
    </svg>
  );
};

export default StallOverlay;
