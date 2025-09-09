# Safari Map Grid Scaling Documentation

## Update: Non-Square Map Support

As of January 2025, the Safari Map system now supports:
- **Flexible grid dimensions**: Any size from 1x1 to 100x100
- **Non-square maps**: Full support for rectangular grids (e.g., 3x1, 5x10)
- **Dynamic coordinate generation**: Properly handles wide maps with extended column labels (AA, AB, etc.)

## Current Issue

The Safari Map system currently uses **fixed grid parameters** regardless of the image dimensions:
- `borderSize: 80`
- `lineWidth: 4` 
- `fontSize: 40`

This causes visual issues where:
- Small images (e.g., 500x500) have oversized text and thick lines
- Large images (e.g., 3000x3000) have tiny, hard-to-read labels
- Grid lines may appear too thick or too thin relative to the image

## Root Cause

In `mapExplorer.js`, all three map creation/update functions use hardcoded values:

```javascript
const gridSystem = new MapGridSystem(mapPath, {
  gridWidth: mapColumns,   // Now supports separate width
  gridHeight: mapRows,     // Now supports separate height
  borderSize: 80,          // Still fixed value
  lineWidth: 4,            // Still fixed value  
  fontSize: 40,            // Still fixed value
  labelStyle: 'standard'
});
```

## Recommended Solution: Dynamic Scaling

### Calculate Parameters Based on Image Dimensions

```javascript
/**
 * Calculate optimal grid parameters based on image dimensions
 * @param {number} imageWidth - Width of the source image in pixels
 * @param {number} imageHeight - Height of the source image in pixels
 * @param {number} gridColumns - Number of horizontal grid cells
 * @param {number} gridRows - Number of vertical grid cells
 * @returns {Object} Optimized grid parameters
 */
function calculateOptimalGridParameters(imageWidth, imageHeight, gridColumns, gridRows) {
  const avgDimension = (imageWidth + imageHeight) / 2;
  
  // Scale parameters based on image size
  // Base values optimized for 1000x1000 image
  const BASE_SIZE = 1000;
  const scaleFactor = avgDimension / BASE_SIZE;
  
  return {
    // Border scales with image size (5-10% of image width)
    borderSize: Math.round(Math.min(Math.max(avgDimension * 0.08, 40), 200)),
    
    // Line width scales logarithmically (thinner for larger images)
    lineWidth: Math.round(Math.min(Math.max(2 + Math.log2(scaleFactor) * 1.5, 2), 8)),
    
    // Font size based on cell size (using the smaller dimension for better fit)
    fontSize: Math.round(Math.min(Math.max(
      Math.min(imageWidth / gridColumns, imageHeight / gridRows) * 0.15, 
      20
    ), 80)),
    
    labelStyle: 'standard'
  };
}
```

### Implementation in mapExplorer.js

Replace the hardcoded values in all three functions:

```javascript
// In createMapGridWithCustomImage
const metadata = await sharp(imageBuffer).metadata();
const optimalParams = calculateOptimalGridParameters(
  metadata.width, 
  metadata.height, 
  mapColumns,
  mapRows
);

const gridSystem = new MapGridSystem(tempMapPath, {
  gridWidth: mapColumns,
  gridHeight: mapRows,
  ...optimalParams
});
```

## Parameter Scaling Logic

### Border Size
- **Purpose**: White frame around the map for coordinate labels
- **Scaling**: 5-10% of average image dimension
- **Min**: 40px (readable on small images)
- **Max**: 200px (prevent excessive borders on huge images)

### Line Width
- **Purpose**: Grid lines visibility
- **Scaling**: Logarithmic (grows slowly with image size)
- **Min**: 2px (thin lines for small images)
- **Max**: 8px (thick lines for large images)
- **Formula**: `2 + log2(scaleFactor) * 1.5`

### Font Size
- **Purpose**: Coordinate label readability
- **Scaling**: Proportional to cell size
- **Min**: 20px (minimum readable size)
- **Max**: 80px (prevent oversized text)
- **Formula**: 15% of cell dimension

## Example Calculations

| Image Size | Border | Line Width | Font Size | Notes |
|------------|--------|------------|-----------|-------|
| 500x500    | 40px   | 2px        | 20px      | Small map, minimum values |
| 1000x1000  | 80px   | 4px        | 21px      | Base reference size |
| 2000x2000  | 160px  | 5px        | 43px      | Large map, scaled up |
| 3000x3000  | 200px  | 6px        | 64px      | Extra large, capped values |

## Additional Considerations

### Non-Square Images (NOW SUPPORTED)
The system now fully supports non-square images and non-square grids:
```javascript
// Calculate based on both dimensions independently
const cellWidth = imageWidth / gridColumns;
const cellHeight = imageHeight / gridRows;
const minCellDimension = Math.min(cellWidth, cellHeight);

// Scale font to fit in the smaller cell dimension
const fontSize = Math.round(minCellDimension * 0.15);
```

### Grid Density Impact
Larger grids (more cells) need smaller fonts to fit labels:
```javascript
// Adjust font size based on total cell count
const totalCells = gridColumns * gridRows;
const densityFactor = Math.sqrt(49 / totalCells); // Base on 7x7 grid
fontSize = Math.round(fontSize * densityFactor);
```

### User Preferences
Consider adding user-configurable overrides:
```javascript
const userPrefs = {
  fontSizeMultiplier: 1.2,  // Make text 20% larger
  lineWidthMultiplier: 0.8, // Make lines 20% thinner
  borderSizeOverride: null  // Use calculated value
};
```

## Implementation Priority

1. **Phase 1**: Implement basic dynamic scaling in `createMapGridWithCustomImage` and `updateMapImage`
2. **Phase 2**: Add user preference support via modal inputs
3. **Phase 3**: Support non-square images with aspect ratio preservation
4. **Phase 4**: Add preview functionality before finalizing map creation

## Testing Recommendations

Test with various image sizes and aspect ratios:
- Square maps: 500x500, 1000x1000, 2000x2000
- Wide maps: 1500x500, 2000x800, 3000x1000
- Tall maps: 500x1500, 800x2000, 1000x3000
- Extreme aspect ratios: 3000x300 (10:1), 300x3000 (1:10)
- Minimum sizes: 100x100, 200x50, 50x200

Test with various grid configurations:
- Minimum: 1x1 (single cell)
- Linear: 1x3, 3x1, 1x10
- Small: 2x2, 3x3, 2x5
- Standard: 5x5, 7x7, 10x10
- Large: 20x20, 15x30
- Maximum: Up to 400 total cells

Verify:
- Labels remain readable at all sizes
- Grid lines are visible but not overwhelming
- Border provides adequate space for coordinates
- Performance remains acceptable for large images