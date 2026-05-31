import os

def decode_mojibake(text):
    # Try to find all valid UTF-8 sequences encoded as cp1251
    # We will build a new string character by character
    res = []
    i = 0
    n = len(text)
    changed = False
    while i < n:
        if i + 1 < n:
            # Check if text[i:i+2] corresponds to a valid utf-8 encoded Cyrillic character
            # when decoded via cp1251
            try:
                # encode string to cp1251 bytes
                b = text[i:i+2].encode('cp1251')
                # decode bytes to utf-8 string
                c = b.decode('utf-8')
                # if the resulting character is Cyrillic, we replace
                if len(c) == 1 and ('\u0400' <= c <= '\u04FF'):
                    res.append(c)
                    i += 2
                    changed = True
                    continue
            except:
                pass
            
            # UTF-8 can be 3 bytes (e.g. for some symbols)
            if i + 2 < n:
                try:
                    b = text[i:i+3].encode('cp1251')
                    c = b.decode('utf-8')
                    if len(c) == 1 and c in ('—', '«', '»', '₽', '№', '•', '…', '–', '“', '”', '’'):
                        res.append(c)
                        i += 3
                        changed = True
                        continue
                except:
                    pass

        res.append(text[i])
        i += 1
    
    return "".join(res), changed

def fix_all_files():
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '.venv', '.next', '__pycache__')]
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.jsx', '.html', '.md', '.py', '.css', '.json', '.yml', '.yaml')):
                filepath = os.path.join(root, file)
                if 'fix-all-mojibake.py' in filepath: continue
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    fixed, changed = decode_mojibake(content)
                    if changed:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(fixed)
                        print("Fixed:", filepath)
                except Exception as e:
                    pass

if __name__ == '__main__':
    fix_all_files()
