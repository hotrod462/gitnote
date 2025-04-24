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

// Helper function to calculate decorations using node iteration
function calculateDecorations(diffResult: Change[] | null, doc: Node): DecorationSet {
  // --- Temporarily Disabled --- 
  /*
  if (!diffResult) {
    console.log("calculateDecorations (node-aware): No diffResult provided.");
    return DecorationSet.empty;
  }

  console.log("calculateDecorations (node-aware): Starting calculation", { diffLength: diffResult.length, docSize: doc.content.size });
  const decorations: Decoration[] = [];
  
  let diffPartIndex = 0;       // Current index in diffResult array
  let diffPartOffset = 0;      // Offset within the current diffResult[diffPartIndex].value string
  let accumulatedDocPos = 1;   // Track the position in the document (1-based)

  // Iterate through the document nodes
  doc.descendants((node, pos) => {
    if (diffPartIndex >= diffResult.length) return false; // Stop if we've processed all diff parts
    
    // Focus only on text nodes with actual content
    if (!node.isText || node.text === null || node.text === undefined) { 
        // Skip non-text nodes or text nodes without content
        return true; // Continue descending
    }

    let nodeOffset = 0; // Offset within the current text node
    // We know node.text is a string here due to the check above
    const nodeText: string = node.text;
    const nodeEndPos = pos + node.nodeSize;

    // console.log(`Node Iter: pos=${pos}, size=${node.nodeSize}, endPos=${nodeEndPos}, text="${nodeText.substring(0,10)}...", currentDiffIdx=${diffPartIndex}`);

    // Process the current text node against potentially multiple diff parts
    while (nodeOffset < nodeText.length && diffPartIndex < diffResult.length) {
      const currentDiffPart = diffResult[diffPartIndex];
      const remainingDiffPartText = currentDiffPart.value.substring(diffPartOffset);
      const remainingNodeText = nodeText.substring(nodeOffset);
      
      // Determine how many characters to compare/process in this step
      const processLength = Math.min(remainingDiffPartText.length, remainingNodeText.length);
      
      // console.log(`  Inner loop: nodeOffset=${nodeOffset}, diffPartOffset=${diffPartOffset}, processLength=${processLength}, diffPartType=${currentDiffPart.added ? 'add' : currentDiffPart.removed ? 'rem' : 'com'}`);

      if (currentDiffPart.added) {
        // This text exists in the document AND corresponds to an added part
        const startPos = pos + 1 + nodeOffset; // Position within the doc
        const endPos = startPos + processLength;
        const style = 'background-color: rgba(0, 255, 0, 0.2);';

        if (startPos < endPos) { // Ensure valid range
           console.log(`  Adding decoration: diff-added from ${startPos} to ${endPos}`);
           decorations.push(Decoration.inline(startPos, endPos, { style: style }));
        }

        // Advance offsets
        nodeOffset += processLength;
        diffPartOffset += processLength;
        accumulatedDocPos += processLength; // Advance doc pos as this text is present

      } else if (currentDiffPart.removed) {
        // This part does *not* exist in the document node.
        // We only advance the diff part offset/index.
        // The document iterator (`nodeOffset`) should NOT advance here for this part.
        diffPartOffset += remainingDiffPartText.length; // Consume the entire removed part
        // DO NOT advance nodeOffset
        // DO NOT advance accumulatedDocPos
        // console.log(`   Skipping removed part: len=${remainingDiffPartText.length}`);
        
      } else { // Common part
         // This text exists in the document and is common.
         // Just advance all offsets.
        // console.log(`   Skipping common part: len=${processLength}`);
        nodeOffset += processLength;
        diffPartOffset += processLength;
        accumulatedDocPos += processLength; // Advance doc pos as this text is present
      }

      // If we've finished processing the current diff part, move to the next
      if (diffPartOffset >= currentDiffPart.value.length) {
        // console.log(`   Finished diff part ${diffPartIndex}`);
        diffPartIndex++;
        diffPartOffset = 0;
      }
    }
    
    // Ensure we don't descend into nodes if we are done with diffs
    return diffPartIndex < diffResult.length;
  });

  console.log(`calculateDecorations (node-aware): Finished. Found ${decorations.length} decorations. Accumulated Doc Pos: ${accumulatedDocPos}`);
  // Check if accumulated position matches doc size as a sanity check
   if (accumulatedDocPos !== doc.content.size + 1) {
       console.warn(`Final accumulated position (${accumulatedDocPos}) does not match document content size + 1 (${doc.content.size + 1}). Mapping might be inaccurate.`);
   }

  return DecorationSet.create(doc, decorations);
  */
 return DecorationSet.empty; // Return empty set while disabled
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