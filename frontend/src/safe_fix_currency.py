import os
import re

src_dir = r"c:\Users\nitya\Desktop\LaserHub\frontend\src"

def get_relative_path(file_path):
    rel_path = os.path.relpath(file_path, src_dir)
    depth = rel_path.count(os.sep)
    if depth == 0:
        return "./utils/formatPrice"
    elif depth == 1:
        return "../utils/formatPrice"
    elif depth == 2:
        return "../../utils/formatPrice"
    else:
        return "../../../utils/formatPrice"

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith(".tsx"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8") as file:
                lines = file.readlines()
            
            changed = False
            for i, line in enumerate(lines):
                # skip template literals
                if "`" in line:
                    continue
                
                # e.g. ${item.unit_price.toFixed(2)}
                new_line, c1 = re.subn(r'\$\{(.*?)\.toFixed\(\d+\)\}', r'{formatPrice(\1)}', line)
                # e.g. >$10.00<
                new_line, c2 = re.subn(r'>\$([0-9\.]+)<', r'>{formatPrice(\1)}<', new_line)
                
                if c1 > 0 or c2 > 0:
                    lines[i] = new_line
                    changed = True
            
            if changed:
                new_content = "".join(lines)
                if "import { formatPrice }" not in new_content:
                    import_path = get_relative_path(path)
                    import_stmt = f"import {{ formatPrice }} from '{import_path}';\n"
                    # Put it after the last import
                    split_lines = new_content.split('\n')
                    last_import_idx = -1
                    for i, l in enumerate(split_lines):
                        if l.startswith("import "):
                            last_import_idx = i
                    if last_import_idx != -1:
                        split_lines.insert(last_import_idx + 1, import_stmt.strip())
                    else:
                        split_lines.insert(0, import_stmt.strip())
                    new_content = '\n'.join(split_lines)
                
                with open(path, "w", encoding="utf-8") as file:
                    file.write(new_content)
                print(f"Updated {path}")
