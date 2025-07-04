import sharp from 'sharp';

async function createGridWithBorder() {
    console.log('🎨 Creating grids with white borders...');
    
    const mapPath = './img/map.png';
    
    try {
        const mapMetadata = await sharp(mapPath).metadata();
        console.log('Original map:', mapMetadata.width, 'x', mapMetadata.height);
        
        // Create variations with different parameters
        const variations = [
            { gridSize: 10, borderSize: 80, lineWidth: 3, fontSize: 36, name: 'standard' },
            { gridSize: 8, borderSize: 100, lineWidth: 4, fontSize: 48, name: 'large' },
            { gridSize: 12, borderSize: 70, lineWidth: 2, fontSize: 32, name: 'fine' },
            { gridSize: 10, borderSize: 120, lineWidth: 5, fontSize: 54, name: 'extra_thick' },
            { gridSize: 5, borderSize: 100, lineWidth: 4, fontSize: 48, name: 'coarse' }
        ];
        
        for (const variant of variations) {
            await createGridVariation(mapPath, mapMetadata, variant);
        }
        
        // Create a special version with row numbers on left side too
        await createGridWithSideLabels(mapPath, mapMetadata);
        
        // Create a version with alternating cell shading
        await createGridWithShading(mapPath, mapMetadata);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function createGridVariation(mapPath, mapMetadata, config) {
    const { gridSize, borderSize, lineWidth, fontSize, name } = config;
    
    // Calculate new dimensions with border
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    
    // Calculate cell dimensions (for the map area only, not including borders)
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    // Create SVG with white background and grid
    const svg = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <!-- White background -->
            <rect width="${newWidth}" height="${newHeight}" fill="white"/>
            
            <!-- Place map image -->
            <image href="file://${process.cwd()}/img/map.png" 
                   x="${borderSize}" y="${borderSize}" 
                   width="${mapMetadata.width}" height="${mapMetadata.height}"/>
            
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
            
            <!-- Column labels (A, B, C, etc.) -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize / 2 + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            <!-- Row labels (1, 2, 3, etc.) -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize / 2}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    
    await sharp(svgBuffer)
        .png()
        .toFile(`./img/gridmap_border_${name}.png`);
        
    console.log(`✅ Created gridmap_border_${name}.png (${gridSize}x${gridSize} grid, ${borderSize}px border)`);
}

async function createGridWithSideLabels(mapPath, mapMetadata) {
    const gridSize = 10;
    const borderSize = 100;
    const lineWidth = 3;
    const fontSize = 42;
    
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
            
            <!-- Grid lines with extensions into border -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize + (i * cellWidth)}" y1="0" 
                      x2="${borderSize + (i * cellWidth)}" y2="${newHeight}" 
                      stroke="black" stroke-width="${lineWidth}" opacity="${i === 0 || i === gridSize ? 1 : 0.8}"/>
            `).join('')}
            
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="0" y1="${borderSize + (i * cellHeight)}" 
                      x2="${newWidth}" y2="${borderSize + (i * cellHeight)}" 
                      stroke="black" stroke-width="${lineWidth}" opacity="${i === 0 || i === gridSize ? 1 : 0.8}"/>
            `).join('')}
            
            <!-- Column labels at top AND bottom -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize / 2 + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial Black, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="900" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${newHeight - borderSize / 2 + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial Black, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="900" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            <!-- Row labels on left AND right -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize / 2}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial Black, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="900" 
                      fill="black">
                    ${i + 1}
                </text>
                <text x="${newWidth - borderSize / 2}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial Black, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="900" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    
    await sharp(svgBuffer)
        .png()
        .toFile('./img/gridmap_border_all_sides.png');
        
    console.log('✅ Created gridmap_border_all_sides.png (labels on all sides)');
}

async function createGridWithShading(mapPath, mapMetadata) {
    const gridSize = 10;
    const borderSize = 90;
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
            
            <!-- Gray border area -->
            <rect x="10" y="10" width="${newWidth - 20}" height="${newHeight - 20}" 
                  fill="none" stroke="#666" stroke-width="2"/>
            
            <!-- Place map image -->
            <image href="file://${process.cwd()}/img/map.png" 
                   x="${borderSize}" y="${borderSize}" 
                   width="${mapMetadata.width}" height="${mapMetadata.height}"/>
            
            <!-- Subtle shading for alternating cells -->
            ${Array.from({ length: gridSize }, (_, y) => 
                Array.from({ length: gridSize }, (_, x) => 
                    (x + y) % 2 === 0 ? '' : `
                        <rect x="${borderSize + (x * cellWidth)}" 
                              y="${borderSize + (y * cellHeight)}" 
                              width="${cellWidth}" 
                              height="${cellHeight}" 
                              fill="black" 
                              opacity="0.05"/>
                    `
                ).join('')
            ).join('')}
            
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
            
            <!-- Coordinate labels with background -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <rect x="${borderSize + (i * cellWidth) + (cellWidth / 2) - 25}" 
                      y="${borderSize / 2 - fontSize / 2 - 5}" 
                      width="50" height="${fontSize + 10}" 
                      fill="white" stroke="black" stroke-width="1" rx="5"/>
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize / 2 + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            ${Array.from({ length: gridSize }, (_, i) => `
                <rect x="${borderSize / 2 - 25}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) - fontSize / 2 - 5}" 
                      width="50" height="${fontSize + 10}" 
                      fill="white" stroke="black" stroke-width="1" rx="5"/>
                <text x="${borderSize / 2}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const svgBuffer = Buffer.from(svg);
    
    await sharp(svgBuffer)
        .png()
        .toFile('./img/gridmap_border_shaded.png');
        
    console.log('✅ Created gridmap_border_shaded.png (with alternating cell shading)');
}

// Run the script
createGridWithBorder();