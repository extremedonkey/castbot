#!/usr/bin/env python3
"""
Convert Higher Education Taxonomy markdown with Mermaid diagrams to PDF
"""

import re
import os
import subprocess
import tempfile
from pathlib import Path

def extract_mermaid_diagrams(markdown_content):
    """Extract Mermaid diagrams from markdown content"""
    pattern = r'```mermaid\n(.*?)\n```'
    diagrams = re.findall(pattern, markdown_content, re.DOTALL)
    return diagrams

def create_mermaid_files(diagrams):
    """Create individual .mmd files for each diagram"""
    diagram_files = []
    for i, diagram in enumerate(diagrams):
        filename = f"/tmp/diagram_{i+1}.mmd"
        with open(filename, 'w') as f:
            f.write(diagram.strip())
        diagram_files.append(filename)
    return diagram_files

def convert_diagrams_to_images(diagram_files):
    """Convert Mermaid diagrams to PNG images"""
    image_files = []
    for mmd_file in diagram_files:
        png_file = mmd_file.replace('.mmd', '.png')
        try:
            result = subprocess.run([
                'mmdc', '-i', mmd_file, '-o', png_file,
                '--backgroundColor', 'white',
                '--theme', 'default'
            ], capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                image_files.append(png_file)
                print(f"✓ Created {png_file}")
            else:
                print(f"✗ Failed to create {png_file}: {result.stderr}")

        except subprocess.TimeoutExpired:
            print(f"✗ Timeout converting {mmd_file}")
        except Exception as e:
            print(f"✗ Error converting {mmd_file}: {e}")

    return image_files

def create_enhanced_markdown(original_content, image_files):
    """Replace Mermaid code blocks with image references"""
    diagrams = extract_mermaid_diagrams(original_content)
    enhanced_content = original_content

    for i, diagram in enumerate(diagrams):
        if i < len(image_files):
            mermaid_block = f"```mermaid\n{diagram}\n```"
            image_ref = f"![Diagram {i+1}]({image_files[i]})"
            enhanced_content = enhanced_content.replace(mermaid_block, image_ref, 1)

    return enhanced_content

def main():
    # Read the original markdown file
    input_file = "/home/reece/castbot/00-DEL-HigherEd.md"

    with open(input_file, 'r') as f:
        content = f.read()

    print("📊 Extracting Mermaid diagrams...")
    diagrams = extract_mermaid_diagrams(content)
    print(f"Found {len(diagrams)} diagrams")

    print("📁 Creating Mermaid files...")
    diagram_files = create_mermaid_files(diagrams)

    print("🖼️  Converting diagrams to images...")
    image_files = convert_diagrams_to_images(diagram_files)

    print("📝 Creating enhanced markdown...")
    enhanced_content = create_enhanced_markdown(content, image_files)

    # Save enhanced markdown
    enhanced_file = "/tmp/00-DEL-HigherEd-enhanced.md"
    with open(enhanced_file, 'w') as f:
        f.write(enhanced_content)

    print(f"✓ Enhanced markdown saved to: {enhanced_file}")
    print(f"✓ Diagram images saved to: /tmp/diagram_*.png")

    # List all created files
    print("\n📂 Created files:")
    for img in image_files:
        if os.path.exists(img):
            print(f"   • {img}")

    print(f"\n📖 To convert to PDF, you can use:")
    print(f"   pandoc {enhanced_file} -o /tmp/HigherEd-Taxonomy.pdf")
    print(f"   or any markdown to PDF converter")

if __name__ == "__main__":
    main()