import type { LegalBlock, LegalDoc } from '../content';

/**
 * 약관·방침 한 벌을 그린다. 이용약관과 개인정보처리방침이 같은 껍데기를 쓴다.
 *
 * **읽으라고 만든 화면이라 폭을 좁게 잡는다.** 조문은 한 줄이 길어지면 다음 줄 첫 글자를
 * 놓친다 — max-w-3xl 은 한글 기준 한 줄 45자 안팎이다.
 */
export function LegalDocumentView({
  doc,
  notices = [],
}: {
  doc: LegalDoc;
  /** 본문 위에 띄우는 안내(개정 예고, 언어 안내). 없으면 아무것도 그리지 않는다. */
  notices?: string[];
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-ink-body">
      <h1 className="text-xl font-bold text-ink">{doc.title}</h1>
      <p className="mt-1 text-xs text-ink-subtle">{doc.effective}</p>

      {notices.map((notice) => (
        <p
          key={notice}
          className="mt-4 rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink-muted"
        >
          {notice}
        </p>
      ))}

      {doc.intro.map((paragraph, index) => (
        <p key={index} className="mt-4">
          {paragraph}
        </p>
      ))}

      {doc.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="font-bold text-ink">{section.heading}</h2>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </section>
      ))}
    </article>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') {
    return <p className="mt-2">{block}</p>;
  }

  if ('list' in block) {
    /*
      번호는 글 안에 직접 들어 있다(types.ts 참고). list-none 으로 두는 이유 —
      ol 의 자동 번호를 켜면 "1." 이 두 번 찍히고, 항(①)과 호(1.)가 섞인 조에서
      번호 체계가 무너진다.
    */
    return (
      <ul className="mt-2 space-y-1 pl-4">
        {block.list.map((item, index) => (
          <li key={index} className="-indent-4 pl-4">
            {item}
          </li>
        ))}
      </ul>
    );
  }

  /*
    국외이전·위탁 고지는 항목마다 나라·기간을 나란히 밝혀야 해서 표다.
    좁은 화면에서 표를 접으면 어느 값이 어느 칸인지 사라지므로, 대신 표째로 옆으로 민다.
  */
  return (
    <div className="mt-3 -mx-4 overflow-x-auto px-4">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-left text-ink-muted">
            {block.table.head.map((cell) => (
              <th key={cell} className="whitespace-nowrap py-2 pr-4 font-bold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, index) => (
            <tr key={index} className="border-b border-line align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="min-w-[8rem] py-2 pr-4">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
