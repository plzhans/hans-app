#!/usr/bin/env python3
"""병원 이름 번역 사전.

**번역문은 자산이고, 할 일 목록은 산출물이다.** 둘을 다른 곳에 둔다.

  data/i18n/hospital_<field>_<lang>.jsonl
                                   번역된 것만. **git 이 추적한다.**
                                   돈과 시간을 들여 만든 것이고 재생성이 안 된다.
                                   프롬프트를 채점할 정답지이기도 하다.

  temp/hospital_i18n_<lang>.jsonl  export 가 만든 원문. 언제든 다시 뽑는다.

할 일 = (원문의 고유값) − (사전에 이미 있는 것). 파일로 들고 있지 않고 매번 계산한다 —
할 일 목록을 파일로 저장하면 그게 곧 낡는다.

  next  <lang> <field> <n>   번역할 것 N 개를 번호와 함께 낸다
  fillseq <lang> <field> <n> `<번호>\\t<번역문>` 을 stdin 으로 받아 사전에 넣는다
  stat  <lang> <field>       진행 상황
  apply <lang> <field> <engine>  사전을 원문 파일의 빈 칸에 뿌린다
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TEMP = ROOT / 'temp'
DATA = ROOT / 'data' / 'i18n'


def paths(lang, field):
    # 파일명이 엔티티(hospital) · 필드(name) · 언어(en)를 다 말해야 한다.
    # 한글 파일명은 쓰지 않는다 — git 이 8진 이스케이프로 보여줘 읽을 수가 없다.
    return (TEMP / f'hospital_i18n_{lang}.jsonl',
            DATA / f'hospital_{field}_{lang}.jsonl')


def load_dict(p):
    """번역된 것만 담긴 사전. 없으면 빈 사전."""
    if not p.exists():
        return {}
    out = {}
    for line in p.read_text().splitlines():
        if line.strip():
            d = json.loads(line)
            out[d['ko']] = d['t']
    return out


def save_dict(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open('w') as f:
        for ko, t in d.items():
            f.write(json.dumps({'ko': ko, 't': t}, ensure_ascii=False) + '\n')


def sources(src, field):
    """원문 파일의 고유 원문. 순서를 유지한다(다음 next 가 같은 순서를 줘야 한다)."""
    seen = {}
    for line in src.open():
        ko = json.loads(line)['ko'].get(field)
        if ko is not None and ko not in seen:
            seen[ko] = None
    return list(seen)


def todo(lang, field):
    src, dst = paths(lang, field)
    if not src.exists():
        sys.exit(f'{src} 가 없다. 먼저 `pnpm hansapp-cli i18n export` 를 돌려라')
    done = load_dict(dst)
    return [ko for ko in sources(src, field) if ko not in done], done, dst


def cmd_next(lang, field, n):
    """번역할 원문에 번호를 붙여 낸다.

    번호가 핵심이다. 번역문만 순서대로 받으면 한 줄만 빠져도 그 아래가 전부 엉뚱한 병원에
    붙는데, 그게 조용히 일어난다. 번호가 있으면 즉시 잡힌다.
    """
    rest, _, _ = todo(lang, field)
    for i, ko in enumerate(rest[:n], 1):
        print(f'{i}\t{ko}')


def cmd_fillseq(lang, field, n):
    """`next` 가 준 번호 순서대로 번역문만 받는다.

    원문을 되뱉지 않으므로 출력이 1/4 로 줄고 그만큼 빨라진다.
    번호가 1..N 으로 연속하지 않으면 **아무것도 저장하지 않고 실패한다** —
    반쯤 어긋난 채로 5만 개를 채우는 것보다 시끄럽게 죽는 게 낫다.
    """
    rest, done, dst = todo(lang, field)
    batch = rest[:n]

    got = {}
    for line in sys.stdin:
        line = line.rstrip('\n')
        if not line.strip():
            continue
        idx, _, t = line.partition('\t')
        got[int(idx)] = t.strip()

    missing = [i for i in range(1, len(batch) + 1) if i not in got]
    extra = [i for i in got if i < 1 or i > len(batch)]
    if missing or extra:
        sys.exit(
            f'번호가 안 맞는다. 기대 1..{len(batch)} · 누락 {missing[:5]} · 범위밖 {extra[:5]}'
        )

    for i, ko in enumerate(batch, 1):
        done[ko] = got[i]
    save_dict(dst, done)
    print(f'{len(batch):,}개 채움 → {len(done):,}개')


def cmd_stat(lang, field):
    rest, done, dst = todo(lang, field)
    total = len(done) + len(rest)
    pct = len(done) / total * 100 if total else 0
    print(f'{field}/{lang}: {len(done):,} / {total:,}  ({pct:.1f}%)  남은 것 {len(rest):,}')
    print(f'  사전: {dst}')


def cmd_apply(lang, field, engine):
    src, dst = paths(lang, field)
    d = load_dict(dst)
    out = src.with_suffix('.out.jsonl')
    filled = 0
    with out.open('w') as f:
        for line in src.open():
            row = json.loads(line)
            ko = row['ko'].get(field)
            t = d.get(ko) if ko is not None else None
            if t is not None:
                row[field] = t
                row['engine'] = engine
                filled += 1
            f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(f'{out}: {filled:,}줄 채움 (사전 {len(d):,}개)')


if __name__ == '__main__':
    cmd, lang, field = sys.argv[1], sys.argv[2], sys.argv[3]
    if cmd == 'next':
        cmd_next(lang, field, int(sys.argv[4]))
    elif cmd == 'fillseq':
        cmd_fillseq(lang, field, int(sys.argv[4]))
    elif cmd == 'stat':
        cmd_stat(lang, field)
    elif cmd == 'apply':
        cmd_apply(lang, field, sys.argv[4])
    else:
        sys.exit(f'모르는 커맨드: {cmd}')
