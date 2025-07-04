import sharp from 'sharp';

async function createCreativeGrids() {
    console.log('🎨 Creating creative grid variations...');
    
    const mapPath = './img/map.png';
    
    try {
        const mapMetadata = await sharp(mapPath).metadata();
        
        // Version 1: Exactly matching the example style
        await createExampleStyleGrid(mapPath, mapMetadata);
        
        // Version 2: With coordinate boxes in corners
        await createCornerCoordinateGrid(mapPath, mapMetadata);
        
        // Version 3: With thick outer border
        await createThickBorderGrid(mapPath, mapMetadata);
        
        // Version 4: With gradient background
        await createGradientBorderGrid(mapPath, mapMetadata);
        
        // Version 5: With mini coordinate grid in corner
        await createMiniMapGrid(mapPath, mapMetadata);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function createExampleStyleGrid(mapPath, mapMetadata) {
    const gridSize = 8; // Example appears to be 8x8
    const borderSize = 60;
    const lineWidth = 3;
    const fontSize = 40;
    
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    const svg = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <!-- White background -->
            <rect width="${newWidth}" height="${newHeight}" fill="white"/>
            
            <!-- Place map image -->
            <image href="file://${process.cwd()}/img/map.png" 
                   x="${borderSize}" y="${borderSize}" 
                   width="${mapMetadata.width}" height="${mapMetadata.height}"/>
            
            <!-- Grid lines extending slightly into border -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize + (i * cellWidth)}" y1="${borderSize - 10}" 
                      x2="${borderSize + (i * cellWidth)}" y2="${borderSize + mapMetadata.height + 10}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize - 10}" y1="${borderSize + (i * cellHeight)}" 
                      x2="${borderSize + mapMetadata.width + 10}" y2="${borderSize + (i * cellHeight)}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            <!-- Column labels centered above each cell -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize - 15}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="normal" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            <!-- Row labels centered to left of each cell -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize - 15}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="end" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="normal" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    await sharp(svgBuffer).png().toFile('./img/gridmap_example_style.png');
    console.log('✅ Created gridmap_example_style.png (matching example.png style)');
}

async function createCornerCoordinateGrid(mapPath, mapMetadata) {
    const gridSize = 10;
    const borderSize = 100;
    const lineWidth = 4;
    const fontSize = 36;
    
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    const svg = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <!-- White background -->
            <rect width="${newWidth}" height="${newHeight}" fill="white"/>
            
            <!-- Corner coordinate boxes -->
            <rect x="10" y="10" width="60" height="60" fill="black"/>
            <rect x="${newWidth - 70}" y="10" width="60" height="60" fill="black"/>
            <rect x="10" y="${newHeight - 70}" width="60" height="60" fill="black"/>
            <rect x="${newWidth - 70}" y="${newHeight - 70}" width="60" height="60" fill="black"/>
            
            <!-- Place map image -->
            <image href="file://${process.cwd()}/img/map.png" 
                   x="${borderSize}" y="${borderSize}" 
                   width="${mapMetadata.width}" height="${mapMetadata.height}"/>
            
            <!-- Grid lines -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize + (i * cellWidth)}" y1="${borderSize}" 
                      x2="${borderSize + (i * cellWidth)}" y2="${borderSize + mapMetadata.height}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize}" y1="${borderSize + (i * cellHeight)}" 
                      x2="${borderSize + mapMetadata.width}" y2="${borderSize + (i * cellHeight)}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            <!-- Coordinate labels in cells at edges -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <rect x="${borderSize + (i * cellWidth) + 5}" y="${borderSize - 45}" 
                      width="${cellWidth - 10}" height="40" 
                      fill="white" stroke="black" stroke-width="2"/>
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize - 15}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            ${Array.from({ length: gridSize }, (_, i) => `
                <rect x="${borderSize - 45}" y="${borderSize + (i * cellHeight) + 5}" 
                      width="40" height="${cellHeight - 10}" 
                      fill="white" stroke="black" stroke-width="2"/>
                <text x="${borderSize - 25}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    await sharp(svgBuffer).png().toFile('./img/gridmap_corner_coords.png');
    console.log('✅ Created gridmap_corner_coords.png (with coordinate boxes)');
}

async function createThickBorderGrid(mapPath, mapMetadata) {
    const gridSize = 10;
    const borderSize = 80;
    const lineWidth = 5;
    const fontSize = 42;
    
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    const svg = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <!-- White background -->
            <rect width="${newWidth}" height="${newHeight}" fill="white"/>
            
            <!-- Thick outer frame -->
            <rect x="5" y="5" width="${newWidth - 10}" height="${newHeight - 10}" 
                  fill="none" stroke="black" stroke-width="10"/>
            
            <!-- Inner frame around map -->
            <rect x="${borderSize - 5}" y="${borderSize - 5}" 
                  width="${mapMetadata.width + 10}" height="${mapMetadata.height + 10}" 
                  fill="none" stroke="black" stroke-width="5"/>
            
            <!-- Place map image -->
            <image href="file://${process.cwd()}/img/map.png" 
                   x="${borderSize}" y="${borderSize}" 
                   width="${mapMetadata.width}" height="${mapMetadata.height}"/>
            
            <!-- Extra thick grid lines -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize + (i * cellWidth)}" y1="${borderSize}" 
                      x2="${borderSize + (i * cellWidth)}" y2="${borderSize + mapMetadata.height}" 
                      stroke="black" stroke-width="${i % 5 === 0 ? lineWidth + 2 : lineWidth}"/>
            `).join('')}
            
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize}" y1="${borderSize + (i * cellHeight)}" 
                      x2="${borderSize + mapMetadata.width}" y2="${borderSize + (i * cellHeight)}" 
                      stroke="black" stroke-width="${i % 5 === 0 ? lineWidth + 2 : lineWidth}"/>
            `).join('')}
            
            <!-- Bold labels -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize / 2 + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial Black" 
                      font-size="${fontSize}" 
                      font-weight="900" 
                      fill="black"
                      stroke="white" stroke-width="3" paint-order="stroke">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize / 2}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial Black" 
                      font-size="${fontSize}" 
                      font-weight="900" 
                      fill="black"
                      stroke="white" stroke-width="3" paint-order="stroke">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    await sharp(svgBuffer).png().toFile('./img/gridmap_thick_border.png');
    console.log('✅ Created gridmap_thick_border.png (with extra thick borders and grid)');
}

async function createGradientBorderGrid(mapPath, mapMetadata) {
    const gridSize = 10;
    const borderSize = 100;
    const lineWidth = 3;
    const fontSize = 40;
    
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    const svg = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#f0f0f0;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#ffffff;stop-opacity:1" />
                </linearGradient>
            </defs>
            
            <!-- Gradient background -->
            <rect width="${newWidth}" height="${newHeight}" fill="url(#borderGradient)"/>
            
            <!-- White area for map -->
            <rect x="${borderSize - 10}" y="${borderSize - 10}" 
                  width="${mapMetadata.width + 20}" height="${mapMetadata.height + 20}" 
                  fill="white"/>
            
            <!-- Place map image -->
            <image href="file://${process.cwd()}/img/map.png" 
                   x="${borderSize}" y="${borderSize}" 
                   width="${mapMetadata.width}" height="${mapMetadata.height}"/>
            
            <!-- Grid lines with drop shadow effect -->
            <g filter="url(#dropshadow)">
                ${Array.from({ length: gridSize + 1 }, (_, i) => `
                    <line x1="${borderSize + (i * cellWidth)}" y1="${borderSize}" 
                          x2="${borderSize + (i * cellWidth)}" y2="${borderSize + mapMetadata.height}" 
                          stroke="black" stroke-width="${lineWidth}" opacity="0.9"/>
                `).join('')}
                
                ${Array.from({ length: gridSize + 1 }, (_, i) => `
                    <line x1="${borderSize}" y1="${borderSize + (i * cellHeight)}" 
                          x2="${borderSize + mapMetadata.width}" y2="${borderSize + (i * cellHeight)}" 
                          stroke="black" stroke-width="${lineWidth}" opacity="0.9"/>
                `).join('')}
            </g>
            
            <!-- Labels with shadow -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize / 2 + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black"
                      filter="url(#dropshadow)">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize / 2}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black"
                      filter="url(#dropshadow)">
                    ${i + 1}
                </text>
            `).join('')}
            
            <defs>
                <filter id="dropshadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                    <feOffset dx="2" dy="2" result="offsetblur"/>
                    <feComponentTransfer>
                        <feFuncA type="linear" slope="0.3"/>
                    </feComponentTransfer>
                    <feMerge> 
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/> 
                    </feMerge>
                </filter>
            </defs>
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    await sharp(svgBuffer).png().toFile('./img/gridmap_gradient_border.png');
    console.log('✅ Created gridmap_gradient_border.png (with gradient border)');
}

async function createMiniMapGrid(mapPath, mapMetadata) {
    const gridSize = 10;
    const borderSize = 120;
    const lineWidth = 3;
    const fontSize = 36;
    
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    // Mini map dimensions
    const miniSize = 200;
    const miniCellSize = miniSize / gridSize;
    
    const svg = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <!-- White background -->
            <rect width="${newWidth}" height="${newHeight}" fill="white"/>
            
            <!-- Place map image -->
            <image href="file://${process.cwd()}/img/map.png" 
                   x="${borderSize}" y="${borderSize}" 
                   width="${mapMetadata.width}" height="${mapMetadata.height}"/>
            
            <!-- Main grid -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize + (i * cellWidth)}" y1="${borderSize}" 
                      x2="${borderSize + (i * cellWidth)}" y2="${borderSize + mapMetadata.height}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize}" y1="${borderSize + (i * cellHeight)}" 
                      x2="${borderSize + mapMetadata.width}" y2="${borderSize + (i * cellHeight)}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            <!-- Coordinate labels -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize - 20}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize - 20}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="end" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
            
            <!-- Mini map in top right corner -->
            <g transform="translate(${newWidth - miniSize - 20}, 20)">
                <!-- Mini map background -->
                <rect width="${miniSize}" height="${miniSize}" fill="white" stroke="black" stroke-width="2"/>
                
                <!-- Mini grid -->
                ${Array.from({ length: gridSize + 1 }, (_, i) => `
                    <line x1="${i * miniCellSize}" y1="0" 
                          x2="${i * miniCellSize}" y2="${miniSize}" 
                          stroke="black" stroke-width="0.5" opacity="0.5"/>
                `).join('')}
                
                ${Array.from({ length: gridSize + 1 }, (_, i) => `
                    <line x1="0" y1="${i * miniCellSize}" 
                          x2="${miniSize}" y2="${i * miniCellSize}" 
                          stroke="black" stroke-width="0.5" opacity="0.5"/>
                `).join('')}
                
                <!-- Mini map title -->
                <text x="${miniSize / 2}" y="-5" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="14" 
                      font-weight="bold" 
                      fill="black">
                    MAP GRID
                </text>
            </g>
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    await sharp(svgBuffer).png().toFile('./img/gridmap_minimap.png');
    console.log('✅ Created gridmap_minimap.png (with mini grid reference)');
}

// Run the script
createCreativeGrids();