"""임시 최소 권한 역할로 표본을 적재한다. 접속 비밀번호는 출력하지 않는다."""
import argparse
import base64
import hashlib
import hmac
import json
import pathlib
import secrets

ROLE = 'persona_import_20261001'
ROOT = pathlib.Path('.tmp/persona-sample')
SECRET = ROOT / 'import-credentials.json'
SQL = """insert into persona_data.korean_personas
(uuid,age,age_group,sex,province,district,occupation,marital_status,family_type,education_level,persona,details,sample_group,sample_reasons)
select r->>'uuid',(r->>'age')::smallint,r->>'age_group',r->>'sex',r->>'province',r->>'district',r->>'occupation',r->>'marital_status',r->>'family_type',r->>'education_level',r->>'persona',
r - array['uuid','age','age_group','sex','province','district','occupation','marital_status','family_type','education_level','persona','sample_group','sample_reasons'],r->>'sample_group',r->'sample_reasons'
from jsonb_array_elements(%s::jsonb) r on conflict (uuid) do nothing"""

def initialize():
    if SECRET.exists():
        raise ValueError('기존 임시 접속 정보가 있음')
    password = secrets.token_urlsafe(40)
    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 4096)
    client = hmac.new(salted, b'Client Key', hashlib.sha256).digest()
    stored = hashlib.sha256(client).digest()
    server = hmac.new(salted, b'Server Key', hashlib.sha256).digest()
    encode = lambda value: base64.b64encode(value).decode()
    verifier = f'SCRAM-SHA-256$4096:{encode(salt)}${encode(stored)}:{encode(server)}'
    SECRET.write_text(json.dumps({'password': password}), encoding='utf-8')
    print(json.dumps({'role': ROLE, 'verifier': verifier}))

def upload(host, project):
    import psycopg
    password = json.loads(SECRET.read_text(encoding='utf-8'))['password']
    files = sorted((ROOT / 'batches').glob('*.json'))
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    if len(files) != manifest['batch_count']:
        raise ValueError('배치 수 불일치')
    with psycopg.connect(host=host, port=5432, dbname='postgres', user=f'{ROLE}.{project}', password=password, sslmode='require', connect_timeout=15, application_name='persona_sample_import') as connection:
        for index, path in enumerate(files):
            payload = path.read_text(encoding='utf-8')
            with connection.cursor() as cursor:
                cursor.execute(SQL, (payload,))
            connection.commit()
            if (index + 1) % 10 == 0:
                print(f'적재 완료 {(index + 1) * 500}/50000', flush=True)
    print('적재 세션 종료. MCP로 건수·용량을 검증하고 임시 역할을 제거해야 합니다.', flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--initialize', action='store_true')
    parser.add_argument('--host')
    parser.add_argument('--project', default='fthzjaeucyiudbjxmlgu')
    args = parser.parse_args()
    if args.initialize:
        initialize()
    elif args.host:
        upload(args.host, args.project)
    else:
        parser.error('--initialize 또는 --host 필요')

if __name__ == '__main__':
    main()
