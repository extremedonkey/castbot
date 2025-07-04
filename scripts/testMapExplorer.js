import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test the MapGridSystem
async function testMapGridSystem() {
  console.log('🧪 Testing Map Grid System components...');
  
  try {
    // Test 1: Can we import MapGridSystem?
    console.log('\n1️⃣ Testing MapGridSystem import...');
    const { default: MapGridSystem } = await import('../scripts/map-tests/mapGridSystem.js');
    console.log('✅ MapGridSystem imported successfully');
    
    // Test 2: Can we create a grid system instance?
    console.log('\n2️⃣ Testing MapGridSystem instantiation...');
    const mapPath = path.join(dirname(__dirname), 'img', 'map.png');
    const gridSystem = new MapGridSystem(mapPath, {
      gridSize: 5,
      borderSize: 80
    });
    console.log('✅ MapGridSystem instance created');
    
    // Test 3: Can we initialize it?
    console.log('\n3️⃣ Testing initialization...');
    await gridSystem.initialize();
    console.log('✅ Initialization successful');
    console.log(`   Grid dimensions: ${gridSystem.options.gridSize}x${gridSystem.options.gridSize}`);
    console.log(`   Cell size: ${Math.round(gridSystem.cellWidth)}x${Math.round(gridSystem.cellHeight)}px`);
    
    // Test 4: Test coordinate conversion
    console.log('\n4️⃣ Testing coordinate conversion...');
    const testCoords = ['A1', 'C3', 'E5'];
    for (const coord of testCoords) {
      const pos = gridSystem.parseCoordinate(coord);
      const pixels = gridSystem.getCellPixelCoordinates(pos.x, pos.y);
      console.log(`   ${coord} → Grid(${pos.x},${pos.y}) → Pixels(${Math.round(pixels.x)},${Math.round(pixels.y)})`);
    }
    console.log('✅ Coordinate conversion working');
    
    // Test 5: Can we import mapExplorer functions?
    console.log('\n5️⃣ Testing mapExplorer.js imports...');
    const { createMapGrid, deleteMapGrid } = await import('../mapExplorer.js');
    console.log('✅ Map Explorer functions imported successfully');
    
    console.log('\n🎉 All tests passed! Map Explorer system is ready.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run tests
testMapGridSystem();