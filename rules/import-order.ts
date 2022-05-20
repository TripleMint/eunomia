import type { Rule } from 'eslint';
import type { ImportDeclaration } from 'estree';
import handleNonDefaultSpecifiers from '../util/handle-import-specifiers';
import sortImportDeclarations from '../util/sort-import-declarations';
import { diffArray } from '@thi.ng/diff';

const ruleModule: Rule.RuleModule = {
    create(context) {
        const imports: ImportDeclaration[] = [];

        const isSvelteFile = context.getFilename().includes('.svelte');
        const sourceCode = context.getSourceCode();
        const lines = sourceCode.getLines();

        return {
            ImportDeclaration(node) {
                if (!isSvelteFile) {
                    imports.push(node);
                    return;
                }

                const line = lines[node.loc.start.line - 1];

                // If a Svelte file has both an instance and module script block, the `eslint-plugin-svelte3` plugin's
                // processor creates two sub-files for each block. When it does so, it combines both blocks so that
                // references are maintained across blocks to prevent spurious undefined or unused variable errors.
                // Fortunately, it also dedents the relevant portion of code; the other portion is left indented.
                if (!line.startsWith(' ')) {
                    imports.push(node);
                }
            },
            'Program:exit': function ProgramExit() {
                if (!imports.length) {
                    return;
                }

                imports.forEach((importDeclaration) => {
                    handleNonDefaultSpecifiers({ context, importDeclaration, sourceCode });
                });

                const sorted = sortImportDeclarations(imports);
                const diff = diffArray(imports, sorted);

                if (!diff.distance) {
                    return;
                }

                const adds = Object.entries(diff.adds);
                const dels = Object.entries(diff.dels);
                if (adds.length !== dels.length) {
                    throw new Error('import-order: diff mismatch: number of additions and deletions should be the same');
                }

                const unchangedPositions = Object.keys(diff.const).map((position) => parseInt(position, 10));

                adds.forEach(([newPositionKey, node]) => {
                    context.report({
                        fix(fixer) {
                            const fixes: Rule.Fix[] = [];
                            const newPosition = parseInt(newPositionKey, 10);

                            // Remove from old position
                            fixes.push(fixer.remove(node));

                            // Remove trailing whitespace (including newline)
                            const nextToken = sourceCode.getTokenAfter(node);

                            const trailingWhitespaceLength = sourceCode
                                .text
                                .substring(node.range[1] - 1, nextToken ? nextToken.range[0] : sourceCode.text.length)
                                .indexOf('\n');

                            if (trailingWhitespaceLength !== -1) {
                                fixes.push(fixer.removeRange([
                                    node.range[1],
                                    node.range[1] + trailingWhitespaceLength,
                                ]));
                            }

                            // Insert at new position with appropriate newline
                            const nearestUnchangedPosition = unchangedPositions
                                .filter((unchanged) => unchanged < newPosition)
                                .pop();

                            const text = sourceCode.getText(node);

                            if (nearestUnchangedPosition === undefined) {
                                fixes.push(fixer.insertTextBeforeRange([0, 0], `${text}\n`));
                            } else {
                                fixes.push(fixer.insertTextAfter(diff.const[nearestUnchangedPosition], `\n${text}`));
                            }

                            return fixes;
                        },
                        message: 'Import declarations should be sorted.',
                        node,
                    });
                });
            },
        };
    },
    meta: {
        fixable: 'code',
    },
};

export default ruleModule;
