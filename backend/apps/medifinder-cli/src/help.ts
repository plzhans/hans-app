import { Command } from 'commander';

/**
 * commander 가 기본으로 붙이는 영어 문구를 한글로 바꾸고 기본값 표기를 정리한다.
 * 커맨드 트리를 다 만든 뒤 최상위에 한 번 호출하면 하위까지 재귀 적용된다.
 */
export function localizeHelp(command: Command): void {
  command.helpOption('-h, --help', '이 도움말을 출력한다');

  command.configureHelp({
    // 기본값 표기를 (default: "1") 대신 (기본: 1) 로 바꾼다.
    optionDescription: (option) => {
      const description = option.description;
      if (option.defaultValue === undefined) {
        return description;
      }
      return `${description} (기본: ${String(option.defaultValue)})`;
    },
  });

  if (command.commands.length > 0) {
    command.helpCommand('help [command]', '커맨드 도움말을 출력한다');
  }

  for (const child of command.commands) {
    localizeHelp(child);
  }
}

/** 커맨드 도움말 아래에 사용 예시를 붙인다. */
export function addExamples(command: Command, examples: string[]): Command {
  const lines = examples.map((example) => `  $ ${example}`).join('\n');
  return command.addHelpText('after', `\n예시:\n${lines}`);
}
