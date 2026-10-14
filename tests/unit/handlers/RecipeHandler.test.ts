import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecipeHandler } from '../../../src/handlers/RecipeHandler.js';
import type { ScriptExecutor } from '../../../src/bridge/ScriptExecutor.js';

/**
 * These tests pin the *shape* of what the recipe sends to the bridge and the
 * undo-group behaviour — the two things that make a recipe more than an alias
 * for a chain of atomic tools. The ExtendScript's runtime correctness against
 * InDesign is covered by the live smoke path, not here.
 */
describe('RecipeHandler', () => {
  let undoActive: boolean;
  let execute: ReturnType<typeof vi.fn>;
  let startUndoGroup: ReturnType<typeof vi.fn>;
  let endUndoGroup: ReturnType<typeof vi.fn>;
  let handler: RecipeHandler;

  beforeEach(() => {
    undoActive = false;
    execute = vi.fn().mockResolvedValue({ id: 'x', type: 'result', result: '"ok"' });
    startUndoGroup = vi.fn(() => {
      undoActive = true;
    });
    endUndoGroup = vi.fn(() => {
      undoActive = false;
    });

    const executor = {
      get undoGroupActive() {
        return undoActive;
      },
      startUndoGroup,
      endUndoGroup,
      execute,
    };

    handler = new RecipeHandler(executor as unknown as ScriptExecutor);
  });

  it('exposes exactly the two recipes', () => {
    expect(handler.tools.map((t) => t.name)).toEqual([
      'recipe_flowTextStory',
      'recipe_exportPreset',
    ]);
  });

  describe('recipe_flowTextStory', () => {
    const tool = () => handler.tools[0];

    it('places the file and flows the story in one script', async () => {
      await tool().handler({ filePath: '/tmp/story.txt' });

      expect(execute).toHaveBeenCalledTimes(1);
      const [code] = execute.mock.calls[0];
      expect(code).toContain('/tmp/story.txt');
      expect(code).toContain('textFrames.add()');
      expect(code).toContain('.place(');
      expect(code).toContain('nextTextFrame');
      expect(code).toContain('.overflows');
      expect(code).toContain('pages.add()');
    });

    it('runs inside a single undo group and leaves it closed', async () => {
      await tool().handler({ filePath: '/tmp/story.txt' });

      expect(startUndoGroup).toHaveBeenCalledTimes(1);
      expect(endUndoGroup).toHaveBeenCalledTimes(1);
      expect(undoActive).toBe(false);
    });

    it('preserves a group the caller already opened', async () => {
      undoActive = true;
      await tool().handler({ filePath: '/tmp/story.txt' });

      expect(startUndoGroup).toHaveBeenCalledTimes(1);
      expect(endUndoGroup).not.toHaveBeenCalled();
      expect(undoActive).toBe(true);
    });

    it('honours pageIndex, documentIndex and the maxPages cap', async () => {
      await tool().handler({
        filePath: '/tmp/story.txt',
        pageIndex: 3,
        documentIndex: 1,
        maxPages: 4,
      });

      const [code] = execute.mock.calls[0];
      expect(code).toContain('app.documents[1]');
      expect(code).toContain('var __start = 3;');
      expect(code).toContain('var __max = 4;');
    });

    it('rejects an unsafe path before touching the bridge', async () => {
      const res = await tool().handler({ filePath: '/etc/passwd' });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('Invalid file path');
      expect(execute).not.toHaveBeenCalled();
    });

    it('parses the flow result for the caller', async () => {
      execute.mockResolvedValue({
        id: 'x',
        type: 'result',
        result: '{"framesCreated":2,"overflows":false,"pagesUsed":[0,1]}',
      });

      const res = await tool().handler({ filePath: '/tmp/story.txt' });
      expect(JSON.parse(res.content[0].text as string)).toEqual({
        framesCreated: 2,
        overflows: false,
        pagesUsed: [0, 1],
      });
    });
  });

  describe('recipe_exportPreset', () => {
    const tool = () => handler.tools[1];

    it('validates the preset and exports with it in one script', async () => {
      await tool().handler({ presetName: '[Press Quality]', filePath: '/tmp/out.pdf' });

      expect(execute).toHaveBeenCalledTimes(1);
      const [code] = execute.mock.calls[0];
      expect(code).toContain('pdfExportPresets.itemByName("[Press Quality]")');
      expect(code).toContain('isValid');
      expect(code).toContain('/tmp/out.pdf');
      expect(code).toContain('__doc.exportFile(ExportFormat.PDF_TYPE');
      expect(code).toContain('__preset');
    });

    it('runs inside a single undo group', async () => {
      await tool().handler({ presetName: '[Press Quality]', filePath: '/tmp/out.pdf' });

      expect(startUndoGroup).toHaveBeenCalledTimes(1);
      expect(endUndoGroup).toHaveBeenCalledTimes(1);
    });

    it('rejects an unsafe path before touching the bridge', async () => {
      const res = await tool().handler({ filePath: '/etc/out.pdf', presetName: '[Press Quality]' });

      expect(res.isError).toBe(true);
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
