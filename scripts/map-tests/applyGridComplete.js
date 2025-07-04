import sharp from 'sharp';

async function applyAllGridStyles() {
    console.log('🗺️ Creating complete set of grid overlays...\n');
    
    const mapPath = './img/map.png';
    const mapMetadata = await sharp(mapPath).metadata();
    
    // Version 1: Standard 10x10
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 10,
        borderSize: 80,
        lineWidth: 3,
        fontSize: 40,
        outputPath: './img/map_grid_10x10.png',
        description: '10x10 grid'
    });
    
    // Version 2: 8x8 (matching example)
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 8,
        borderSize: 60,
        lineWidth: 3,
        fontSize: 40,
        outputPath: './img/map_grid_8x8.png',
        description: '8x8 grid (like example)'
    });
    
    // Version 3: Fine 12x12
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 12,
        borderSize: 70,
        lineWidth: 2,
        fontSize: 32,
        outputPath: './img/map_grid_12x12.png',
        description: '12x12 fine grid'
    });
    
    // Version 4: Coarse 5x5
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 5,
        borderSize: 100,
        lineWidth: 4,
        fontSize: 48,
        outputPath: './img/map_grid_5x5.png',
        description: '5x5 coarse grid'
    });
    
    // Version 5: Thick borders
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 10,
        borderSize: 100,
        lineWidth: 5,
        fontSize: 44,
        outputPath: './img/map_grid_thick.png',
        description: 'Thick lines grid'
    });
    
    // Version 6: Minimal border
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 10,
        borderSize: 50,
        lineWidth: 2,
        fontSize: 28,
        outputPath: './img/map_grid_minimal.png',
        description: 'Minimal border grid'
    });
    
    console.log('\n✅ All grid styles applied successfully!');
    console.log('\nCreated files:');
    console.log('  - map_grid_10x10.png');
    console.log('  - map_grid_8x8.png');
    console.log('  - map_grid_12x12.png');
    console.log('  - map_grid_5x5.png');
    console.log('  - map_grid_thick.png');
    console.log('  - map_grid_minimal.png');
}

async function createGridOverlay(mapPath, mapMetadata, options) {
    const { gridSize, borderSize, lineWidth, fontSize, outputPath, description } = options;
    
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    // Create white background
    const background = await sharp({
        create: {
            width: newWidth,
            height: newHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    }).png().toBuffer();
    
    // Create grid overlay SVG
    const gridSVG = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <!-- Outer border -->
            <rect x="${borderSize - 2}" y="${borderSize - 2}" 
                  width="${mapMetadata.width + 4}" height="${mapMetadata.height + 4}" 
                  fill="none" stroke="black" stroke-width="${lineWidth + 1}"/>
            
            <!-- Grid lines (vertical) -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize + (i * cellWidth)}" y1="${borderSize}" 
                      x2="${borderSize + (i * cellWidth)}" y2="${borderSize + mapMetadata.height}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            <!-- Grid lines (horizontal) -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize}" y1="${borderSize + (i * cellHeight)}" 
                      x2="${borderSize + mapMetadata.width}" y2="${borderSize + (i * cellHeight)}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            <!-- Column labels -->
            ${Array.from({ length: gridSize }, (_, i) => `
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
            
            <!-- Row labels -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize - 15}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="end" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const gridBuffer = Buffer.from(gridSVG);
    
    // Composite: background -> map -> grid
    await sharp(background)
        .composite([
            {
                input: mapPath,
                top: borderSize,
                left: borderSize
            },
            {
                input: gridBuffer,
                top: 0,
                left: 0
            }
        ])
        .toFile(outputPath);
        
    console.log(`✅ Created ${description}: ${outputPath}`);
}

// Run it!
applyAllGridStyles().catch(console.error);