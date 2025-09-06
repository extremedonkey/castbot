# Safari Map Grid Scaling Documentation

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
  gridSize: gridSize,
  borderSize: 80,      // Fixed value
  lineWidth: 4,        // Fixed value  
  fontSize: 40,        // Fixed value
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
 * @param {number} gridSize - Number of grid cells (e.g., 7 for 7x7)
 * @returns {Object} Optimized grid parameters
 */
function calculateOptimalGridParameters(imageWidth, imageHeight, gridSize) {
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
    
    // Font size based on cell size (roughly 1/3 of cell height)
    fontSize: Math.round(Math.min(Math.max((avgDimension / gridSize) * 0.15, 20), 80)),
    
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
  gridSize
);

const gridSystem = new MapGridSystem(tempMapPath, {
  gridSize: gridSize,
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

### Square vs Non-Square Images
Currently, the system requires square images. For non-square support:
```javascript
// Use the smaller dimension to maintain aspect ratio
const minDimension = Math.min(imageWidth, imageHeight);
const scaleFactor = minDimension / BASE_SIZE;
```

### Grid Size Impact
Larger grids (more cells) need smaller fonts to fit labels:
```javascript
// Adjust font size inversely with grid density
const gridDensityFactor = 7 / gridSize; // Base on 7x7 grid
fontSize = Math.round(fontSize * gridDensityFactor);
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

Test with various image sizes:
- Minimum: 300x300 (Discord emoji size)
- Small: 500x500
- Medium: 1000x1000
- Large: 2000x2000
- Maximum: 4000x4000 (typical camera photo)

Verify:
- Labels remain readable at all sizes
- Grid lines are visible but not overwhelming
- Border provides adequate space for coordinates
- Performance remains acceptable for large images