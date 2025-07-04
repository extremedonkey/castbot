import MapGridSystem from './mapGridSystem.js';

async function demonstrateUsage() {
    console.log('🗺️ MapGridSystem Usage Examples\n');
    
    // Example 1: Simple grid overlay
    console.log('1️⃣ Creating a simple 10x10 grid:');
    const simpleGrid = new MapGridSystem('./img/map.png');
    await simpleGrid.generateGridOverlay('./img/example_simple_grid.png');
    
    // Example 2: Custom styling
    console.log('\n2️⃣ Creating a custom styled grid:');
    const styledGrid = new MapGridSystem('./img/map.png', {
        gridSize: 12,
        borderSize: 100,
        lineWidth: 4,
        fontSize: 44,
        gridColor: '#2C3E50',
        borderColor: '#ECF0F1',
        labelStyle: 'boxed',
        coordinateSchema: 'letters-numbers'
    });
    await styledGrid.generateGridOverlay('./img/example_styled_grid.png');
    
    // Example 3: Working with coordinates
    console.log('\n3️⃣ Working with coordinates:');
    await simpleGrid.initialize();
    
    // Convert coordinate to pixel position
    const coord = 'D4';
    const gridPos = simpleGrid.parseCoordinate(coord);
    const pixelPos = simpleGrid.getCellPixelCoordinates(gridPos.x, gridPos.y);
    console.log(`   ${coord} is at grid position (${gridPos.x}, ${gridPos.y})`);
    console.log(`   Cell boundaries: ${Math.round(pixelPos.x)},${Math.round(pixelPos.y)} to ${Math.round(pixelPos.x + pixelPos.width)},${Math.round(pixelPos.y + pixelPos.height)}`);
    console.log(`   Cell center: ${Math.round(pixelPos.centerX)},${Math.round(pixelPos.centerY)}`);
    
    // Example 4: Marking locations
    console.log('\n4️⃣ Marking specific locations:');
    const locations = [
        { coordinate: 'B2', type: 'circle', color: '#E74C3C', size: 35, label: 'Start' },
        { coordinate: 'H8', type: 'circle', color: '#27AE60', size: 35, label: 'Goal' },
        { coordinate: 'E3', type: 'highlight', color: '#F39C12' },
        { coordinate: 'E4', type: 'highlight', color: '#F39C12' },
        { coordinate: 'E5', type: 'highlight', color: '#F39C12' },
        { coordinate: 'F5', type: 'highlight', color: '#F39C12' },
        { coordinate: 'G5', type: 'highlight', color: '#F39C12' },
        { coordinate: 'G6', type: 'highlight', color: '#F39C12' },
        { coordinate: 'G7', type: 'highlight', color: '#F39C12' },
        { coordinate: 'H7', type: 'highlight', color: '#F39C12' },
        { coordinate: 'H8', type: 'highlight', color: '#F39C12' }
    ];
    await simpleGrid.drawOnCells('./img/example_simple_grid.png', locations, './img/example_path_marked.png');
    
    // Example 5: Different coordinate schemas
    console.log('\n5️⃣ Different coordinate schemas:');
    
    const schemas = [
        { schema: 'letters-numbers', example: 'A1, B2, C3' },
        { schema: 'numbers-only', example: '1-1, 2-2, 3-3' },
        { schema: 'chess-style', example: 'a1, b2, c3' }
    ];
    
    for (const { schema, example } of schemas) {
        const grid = new MapGridSystem('./img/map.png', {
            gridSize: 8,
            coordinateSchema: schema,
            borderSize: 60
        });
        await grid.generateGridOverlay(`./img/example_${schema.replace('-', '_')}.png`);
        console.log(`   ${schema}: ${example}`);
    }
    
    // Example 6: Batch processing
    console.log('\n6️⃣ Processing multiple areas:');
    const areasGrid = new MapGridSystem('./img/map.png', {
        gridSize: 5,
        borderSize: 100,
        fontSize: 48,
        lineWidth: 5
    });
    await areasGrid.generateGridOverlay('./img/example_areas_base.png');
    
    // Define different areas
    const areas = [
        { coordinates: ['A1', 'A2', 'B1', 'B2'], color: '#3498DB', name: 'Water Zone' },
        { coordinates: ['D4', 'D5', 'E4', 'E5'], color: '#E67E22', name: 'Desert' },
        { coordinates: ['C2', 'C3', 'D2', 'D3'], color: '#27AE60', name: 'Forest' }
    ];
    
    const areaMarkers = [];
    for (const area of areas) {
        for (const coord of area.coordinates) {
            areaMarkers.push({
                coordinate: coord,
                type: 'highlight',
                color: area.color
            });
        }
        // Add label to first coordinate
        areaMarkers.push({
            coordinate: area.coordinates[0],
            type: 'circle',
            color: area.color,
            size: 0,
            label: area.name
        });
    }
    
    await areasGrid.drawOnCells('./img/example_areas_base.png', areaMarkers, './img/example_areas_marked.png');
    
    console.log('\n✅ All examples completed! Check the img folder for results.');
}

// Run the demonstration
demonstrateUsage().catch(console.error);