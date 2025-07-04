import MapGridSystem from './mapGridSystem.js';

async function applyGridsToMap() {
    console.log('🗺️ Applying grids to map.png...\n');
    
    // Version 1: Standard 10x10 grid
    const grid10x10 = new MapGridSystem('./img/map.png', {
        gridSize: 10,
        borderSize: 80,
        lineWidth: 3,
        fontSize: 40,
        labelStyle: 'standard'
    });
    await grid10x10.generateGridOverlay('./img/map_grid_10x10.png');
    
    // Version 2: 8x8 grid (like the example)
    const grid8x8 = new MapGridSystem('./img/map.png', {
        gridSize: 8,
        borderSize: 60,
        lineWidth: 3,
        fontSize: 40,
        labelStyle: 'standard'
    });
    await grid8x8.generateGridOverlay('./img/map_grid_8x8.png');
    
    // Version 3: Fine 12x12 grid
    const grid12x12 = new MapGridSystem('./img/map.png', {
        gridSize: 12,
        borderSize: 70,
        lineWidth: 2,
        fontSize: 32,
        labelStyle: 'standard'
    });
    await grid12x12.generateGridOverlay('./img/map_grid_12x12.png');
    
    // Version 4: Coarse 5x5 grid
    const grid5x5 = new MapGridSystem('./img/map.png', {
        gridSize: 5,
        borderSize: 100,
        lineWidth: 4,
        fontSize: 48,
        labelStyle: 'standard'
    });
    await grid5x5.generateGridOverlay('./img/map_grid_5x5.png');
    
    // Version 5: With boxed labels
    const gridBoxed = new MapGridSystem('./img/map.png', {
        gridSize: 10,
        borderSize: 90,
        lineWidth: 3,
        fontSize: 38,
        labelStyle: 'boxed'
    });
    await gridBoxed.generateGridOverlay('./img/map_grid_boxed.png');
    
    // Version 6: Chess style coordinates
    const gridChess = new MapGridSystem('./img/map.png', {
        gridSize: 8,
        borderSize: 80,
        lineWidth: 3,
        fontSize: 40,
        coordinateSchema: 'chess-style',
        labelStyle: 'standard'
    });
    await gridChess.generateGridOverlay('./img/map_grid_chess.png');
    
    console.log('\n✅ All grids applied! Check these files in the img folder:');
    console.log('   - map_grid_10x10.png (standard grid)');
    console.log('   - map_grid_8x8.png (matching example.png)');
    console.log('   - map_grid_12x12.png (fine grid)');
    console.log('   - map_grid_5x5.png (coarse grid)');
    console.log('   - map_grid_boxed.png (with boxed labels)');
    console.log('   - map_grid_chess.png (chess-style coordinates)');
}

// Run it!
applyGridsToMap().catch(console.error);