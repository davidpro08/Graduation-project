"""MCP 전송용 표본 배치를 읽는다. 원본 텍스트를 셸 명령으로 조합하지 않는다."""
import json
import pathlib
import sys
import base64
import zlib

path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text(encoding='utf-8'))
sys.stdout.buffer.write(base64.b64encode(zlib.compress(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)))
