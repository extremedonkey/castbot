import sharp from 'sharp';
import MapGridSystem from './mapGridSystem.js';

async function extractTileFromGrid() {
    console.log('🔍 Proof of Concept: Extracting tile C8 from map_grid_10x10.png\n');
    
    // Load the full grid image
    const gridImagePath = './img/map_grid_10x10.png';
    const gridMetadata = await sharp(gridImagePath).metadata();
    
    console.log(`Grid image dimensions: ${gridMetadata.width}x${gridMetadata.height}`);
    
    // Initialize grid system to get coordinate calculations
    const gridSystem = new MapGridSystem('./img/map.png', {
        gridSize: 10,
        borderSize: 80  // Same as used in map_grid_10x10.png
    });
    await gridSystem.initialize();
    
    // Parse C8 coordinate
    const coord = 'C8';
    const pos = gridSystem.parseCoordinate(coord);
    console.log(`\nCoordinate ${coord} maps to grid position (${pos.x}, ${pos.y})`);
    
    // Get pixel coordinates for the cell (with border offset)
    const cellCoords = gridSystem.getCellPixelCoordinatesWithBorder(pos.x, pos.y);
    console.log(`Cell pixel boundaries: ${cellCoords.x},${cellCoords.y} to ${cellCoords.x + cellCoords.width},${cellCoords.y + cellCoords.height}`);
    console.log(`Cell dimensions: ${Math.round(cellCoords.width)}x${Math.round(cellCoords.height)}px`);
    
    // Extract the tile from the full grid image
    const extractRegion = {
        left: Math.round(cellCoords.x),
        top: Math.round(cellCoords.y),
        width: Math.round(cellCoords.width),
        height: Math.round(cellCoords.height)
    };
    
    console.log(`\nExtracting region:`, extractRegion);
    
    // Extract and save the tile
    await sharp(gridImagePath)
        .extract(extractRegion)
        .toFile('./img/map_c8.png');
        
    console.log(`\n✅ Successfully extracted tile ${coord} to ./img/map_c8.png`);
    
    // Also demonstrate extracting multiple tiles
    console.log('\n📦 Extracting additional tiles for demonstration:');
    const additionalTiles = ['A1', 'E5', 'A5', 'E1'];
    
    for (const tileCoord of additionalTiles) {
        const tilePos = gridSystem.parseCoordinate(tileCoord);
        const tileCellCoords = gridSystem.getCellPixelCoordinatesWithBorder(tilePos.x, tilePos.y);
        
        await sharp(gridImagePath)
            .extract({
                left: Math.round(tileCellCoords.x),
                top: Math.round(tileCellCoords.y),
                width: Math.round(tileCellCoords.width),
                height: Math.round(tileCellCoords.height)
            })
            .toFile(`./img/map_${tileCoord.toLowerCase()}.png`);
            
        console.log(`   ✅ Extracted ${tileCoord} → ./img/map_${tileCoord.toLowerCase()}.png`);
    }
    
    console.log('\n🎯 Proof of concept complete! Individual tiles can be extracted from the grid.');
}

// Run the proof of concept
extractTileFromGrid().catch(console.error);