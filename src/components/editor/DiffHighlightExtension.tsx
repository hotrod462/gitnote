import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Change } from 'diff';
import { Node } from '@tiptap/pm/model';

// Define the options for the extension (can be removed if not used)
// export interface DiffHighlightOptions { ... }

// Define the plugin key - used for transactions and state access
export const pluginKey = new PluginKey<DiffPluginState>('diffHighlight');

// Define the structure of the plugin state
interface DiffPluginState {
  diffResult: Change[] | null;
  decorations: DecorationSet;
}

// Helper function to calculate decorations
function calculateDecorations(diffResult: Change[] | null, doc: Node): DecorationSet {
  if (!diffResult) return DecorationSet.empty;

  console.log("DiffHighlightExtension: Calculating decorations", diffResult);
  const decorations: Decoration[] = [];
  let currentDocPos = 0; // 0-based for calculations

  diffResult.forEach((part) => {
    const partText = part.value;
    const partLength = partText.length;
    let style = '';

    if (part.added) {
      style = 'background-color: rgba(0, 255, 0, 0.2);';
    } else if (part.removed) {
      // Skip removed parts
    }

    if (style) {
      const startPos = currentDocPos + 1; // 1-based for decorations
      const endPos = startPos + partLength;
      if (startPos < endPos && endPos <= doc.content.size + 1) {
        console.log(`Adding decoration: diff-added from ${startPos} to ${endPos}`);
        decorations.push(Decoration.inline(startPos, endPos, { style: style }));
      } else {
        console.warn(`Skipping decoration: Invalid range ${startPos}-${endPos} for doc size ${doc.content.size}`);
      }
    }

    if (!part.removed) {
      currentDocPos += partLength;
    }
  });

  return DecorationSet.create(doc, decorations);
}

// Use AnyExtension instead of Extension<Options> if no options are needed
export const DiffHighlightExtension = Extension.create({
  name: 'diffHighlight',

  // Options can be removed if diffResult is passed only via transaction
  // addOptions() { ... },

  addProseMirrorPlugins() {
    // Remove options closure
    // const options = this.options;

    return [
      new Plugin({
        key: pluginKey,
        state: {
          // Initialize plugin state
          init(_, { doc }): DiffPluginState { 
            return { 
                diffResult: null, // Start with no diff
                decorations: DecorationSet.empty 
            };
          },
          // Update plugin state based on transactions
          apply(tr, oldPluginState, oldEditorState, newEditorState): DiffPluginState {
            // Check for diff result sent via metadata
            const newDiffResult = tr.getMeta(pluginKey) as Change[] | undefined;
            
            // Determine if we need to recalculate decorations
            const needsRecalc = 
                newDiffResult !== undefined || // New diff data arrived
                (tr.docChanged && oldPluginState.diffResult); // Doc changed while diff active

            if (needsRecalc) {
                const currentDiff = newDiffResult !== undefined ? newDiffResult : oldPluginState.diffResult;
                console.log("DiffHighlightExtension (apply): Recalculating due to", { hasNewDiff: newDiffResult !== undefined, docChanged: tr.docChanged });
                const newDecorations = calculateDecorations(currentDiff, newEditorState.doc);
                return { diffResult: currentDiff, decorations: newDecorations };
            } else if (tr.docChanged) {
                 // If only the doc changed but no diff is active or arrived,
                 // just map the old decorations
                 return { 
                     ...oldPluginState, 
                     decorations: oldPluginState.decorations.map(tr.mapping, newEditorState.doc)
                 };
            } else {
                // No change relevant to decorations
                return oldPluginState;
            }
          },
        },
        props: {
          // Provide decorations directly from the plugin state
          decorations(editorState) {
            const pluginState = pluginKey.getState(editorState);
            return pluginState ? pluginState.decorations : DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

// Add basic CSS for highlighting (should go in a global CSS file)
/*
.diff-added {
  background-color: rgba(0, 255, 0, 0.2); 
}
.diff-removed {
  background-color: rgba(255, 0, 0, 0.2);
  text-decoration: line-through;
}
*/ 