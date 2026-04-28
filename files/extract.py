import sys
from PIL import Image

gif = Image.open(r'c:\DEV\Projects\pib_eyes\files\pib-eyes-animated.gif')
frames = []
try:
    while True:
        frames.append(gif.copy().convert('RGBA'))
        gif.seek(len(frames))
except EOFError:
    pass

width, height = frames[0].size
cols = min(8, len(frames))
if cols == 0:
    print("No frames")
    sys.exit(0)

rows = (len(frames) + cols - 1) // cols
grid = Image.new('RGBA', (width * cols, height * rows))

for i, f in enumerate(frames):
    x = (i % cols) * width
    y = (i // cols) * height
    grid.paste(f, (x, y))

grid.save(r'c:\DEV\Projects\pib_eyes\files\spritesheet.png')
print(f'Saved {len(frames)} frames to spritesheet.png')
