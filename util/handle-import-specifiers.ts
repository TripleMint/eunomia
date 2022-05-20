import type { AST, Rule, SourceCode } from 'eslint';
import type { ImportDeclaration, ImportSpecifier, Node } from 'estree';
import { diffArray } from '@thi.ng/diff';

function compare(first: ImportSpecifier, second: ImportSpecifier): number {
    const firstName = first.imported.name.toLocaleLowerCase();
    const secondName = second.imported.name.toLocaleLowerCase();
    return firstName.localeCompare(secondName);
}

function isCommaToken(token: AST.Token) {
    return token.type === 'Punctuator' && token.value === ',';
}

export default function handleNonDefaultSpecifiers(
    { context, importDeclaration, sourceCode }: {
        context: Rule.RuleContext;
        importDeclaration: ImportDeclaration;
        sourceCode: SourceCode;
    }
): void {
    const nonDefaults = importDeclaration
        .specifiers
        .filter((specifier) => specifier.type === 'ImportSpecifier') as ImportSpecifier[];

    if (!nonDefaults.length) {
        return;
    }

    const sortedNonDefaults = [...nonDefaults].sort(compare);
    const diff = diffArray(nonDefaults, sortedNonDefaults);

    if (!diff.distance) {
        return;
    }

    const adds = Object.entries(diff.adds);
    const dels = Object.entries(diff.dels);
    if (adds.length !== dels.length) {
        throw new Error('import-order: diff mismatch: number of additions and deletions should be the same');
    }

    const startBrace = sourceCode.getFirstToken(importDeclaration, {
        filter: (token) => token.type === 'Punctuator' && token.value === '{',
    });

    const endBrace = sourceCode.getFirstToken(importDeclaration, {
        filter: (token) => token.type === 'Punctuator' && token.value === '}',
    });

    const unchangedPositions = Object.keys(diff.const).map((position) => parseInt(position, 10));

    adds.forEach(([newPositionKey, node]) => {
        context.report({
            fix(fixer) {
                const fixes: Rule.Fix[] = [];
                const newPosition = parseInt(newPositionKey, 10);

                // Find range of old position (including leading whitespace and trailing comma)
                const previousToken = sourceCode.getLastTokenBetween(startBrace, node, { filter: isCommaToken });
                const nextToken = sourceCode.getFirstTokenBetween(node, endBrace, { filter: isCommaToken });
                const oldPositionRange: AST.Range = [
                    previousToken ? previousToken.range[1] : startBrace.range[1],
                    nextToken ? nextToken.range[1] : node.range[1],
                ];

                // Remove from old position
                fixes.push(fixer.removeRange(oldPositionRange));

                // Find token to insert text after
                const nearestUnchangedPosition = unchangedPositions
                    .filter((unchanged) => unchanged < newPosition)
                    .pop();

                let insertToken: AST.Token | Node;
                let text = sourceCode.text.substring(...oldPositionRange);
                if (nearestUnchangedPosition === undefined) {
                    insertToken = startBrace;
                } else {
                    insertToken = sourceCode.getFirstTokenBetween(diff.const[nearestUnchangedPosition], endBrace, {
                        filter: isCommaToken,
                    });

                    // We are about to insert after the final specifier, and it doesn't have a trailing comma
                    if (!insertToken) {
                        insertToken = diff.const[nearestUnchangedPosition];
                        text = `,${text}`;
                    }
                }

                // We are about to move what was the final specifier, and it doesn't have a trailing comma
                if (!text.endsWith(',')) {
                    text += ',';
                }

                // Insert at new position
                fixes.push(fixer.insertTextAfter(insertToken, text));

                return fixes;
            },
            message: 'Import specifiers should be sorted.',
            node,
        });
    });
}
