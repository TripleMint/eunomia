import { ImportDeclaration, ImportDefaultSpecifier, ImportNamespaceSpecifier } from 'estree';

declare module 'estree' {
    interface ImportDeclaration {
        importKind: 'type' | 'value';
    }
}

interface ImportDefaultDeclaration extends ImportDeclaration {
    specifiers: [ImportDefaultSpecifier];
}

interface ImportNamespaceDeclaration extends ImportDeclaration {
    specifiers: [ImportNamespaceSpecifier];
}

function compareSources(first: ImportDeclaration, second: ImportDeclaration) {
    const firstFileName = first.source.value as string;
    const secondFileName = second.source.value as string;
    return firstFileName.localeCompare(secondFileName);
}

function compareSpecifiers(first: ImportDefaultDeclaration, second: ImportDefaultDeclaration): number;
function compareSpecifiers(first: ImportNamespaceDeclaration, second: ImportNamespaceDeclaration): number;
function compareSpecifiers(
    first: ImportDefaultDeclaration | ImportNamespaceDeclaration,
    second: ImportDefaultDeclaration | ImportNamespaceDeclaration
) {
    const firstName = first.specifiers[0].local.name.toLocaleLowerCase();
    const secondName = second.specifiers[0].local.name.toLocaleLowerCase();
    return firstName.localeCompare(secondName);
}

class ImportSorter {
    #defaults: ImportDefaultDeclaration[] = [];

    #namespaces: ImportNamespaceDeclaration[] = [];

    #nonDefaults: ImportDeclaration[] = [];

    #sideEffects: ImportDeclaration[] = [];

    add(node: ImportDeclaration) {
        const { specifiers } = node;

        if (!specifiers.length) {
            this.#sideEffects.push(node);
        } else if (specifiers[0].type === 'ImportDefaultSpecifier') {
            this.#defaults.push(node as ImportDefaultDeclaration);
        } else if (specifiers[0].type === 'ImportNamespaceSpecifier') {
            this.#namespaces.push(node as ImportNamespaceDeclaration);
        } else {
            this.#nonDefaults.push(node);
        }
    }

    sort() {
        this.#defaults.sort(compareSpecifiers);
        this.#namespaces.sort(compareSpecifiers);
        this.#sideEffects.sort(compareSources);
        this.#nonDefaults.sort(compareSources);
        return [...this.#sideEffects, ...this.#namespaces, ...this.#defaults, ...this.#nonDefaults];
    }
}

export default function sortImportDeclarations(nodes: ImportDeclaration[]): ImportDeclaration[] {
    const types = new ImportSorter();
    const values = new ImportSorter();

    nodes.forEach((node) => {
        if (node.importKind === 'type') {
            types.add(node);
        } else {
            values.add(node);
        }
    });

    return [...types.sort(), ...values.sort()];
}
