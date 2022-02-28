import {
  Vector2, Vector3, Vector4, Matrix4, Quat,
  util, nstructjs, simple, UIBase, FloatProperty,
  Vec2Property, Vec3Property, Vec4Property,
  Mat4Property, ToolOp, StringProperty, EnumProperty
} from '../path.ux/scripts/pathux.js';
import {Icons} from '../core/icon_enum.js';
import {BrushCommand, BrushCommandStack} from './brush_webgl.js';
import {BrushTools} from '../core/brush.js';

export class BrushCommandOp extends ToolOp {
  static tooldef() {
    return {
      inputs: {
        datapath: new StringProperty()
      }
    }
  }

  getCommandSet(ctx) {
    return ctx.api.getValue(ctx, this.inputs.datapath.getValue());
  }

  undoPre(ctx) {
    let data = [];

    nstructjs.writeObject(data, this.getCommandSet(ctx));
    this.uidata = new Uint8Array(data).buffer;
  }

  undo(ctx) {
    let cset = this.getCommandSet();
    let cset2 = nstructjs.readObject(this.uidata, BrushCommandStack);

    cset.loadShallow(cset2);
    cset.updateGen++;

    window.redraw_all();
  }
}

export class AddBrushCommandOp extends BrushCommandOp {
  static tooldef() {
    return {
      toolpath: "brush.add_command",
      uiname  : "Add",
      icon    : Icons.SMALL_PLUS,
      inputs  : ToolOp.inherit({
        command: new EnumProperty(undefined, BrushTools)
      })
    }
  }

  exec(ctx) {
    let cset = this.getCommandSet(ctx);

    let tool = this.inputs.command.getValue();
    for (let k in BrushTools) {
      if (BrushTools[k] === tool) {
        tool = k.toLowerCase();
        break;
      }
    }

    let cls = BrushCommand.getClass(tool);
    if (!cls) {
      ctx.error("Unknown brush tool " + tool + "!");
      return;
    }

    let brush = ctx.canvas.brush;

    let cmd = new cls();
    cmd.name = tool;

    cmd.syncOverrides(brush);
    cset.add(cmd);
    cset.updateGen++;

    window.redraw_all();
  }
}

ToolOp.register(AddBrushCommandOp);
