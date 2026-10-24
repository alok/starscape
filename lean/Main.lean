import Starscape

/-!
# The bridge: exact data for the viewer

`lake exe starscape-bridge [path]` writes JSON that the web app's tests compare against (default
`../data/lean-bridge.json`). Every number here is computed by Lean from the definitions whose properties are
proved in `Starscape/*.lean`.
-/

open Starscape

def jsonForm (f : Form) : String := s!"[{f.a}, {f.b}, {f.c}]"
def jsonList (xs : List String) : String := "[" ++ ", ".intercalate xs ++ "]"

def bridge : String :=
  let classes := (List.range 400).filter (fun k => isDiscriminant k) |>.map fun k =>
    s!"\{\"k\": {k}, \"h\": {classNumber k}, \"reduced\": {jsonList ((reduced k).map jsonForm)}}"
  let images := [Mat.T, Mat.S, ⟨1, 4, 0, 1⟩, ⟨2, 1, 1, 1⟩].flatMap fun g =>
    [⟨1, 0, 1⟩, ⟨1, 1, 1⟩, ⟨13, 20, 34⟩, ⟨3, -2, 5⟩].map fun (f : Form) =>
      s!"\{\"g\": [{g.p}, {g.q}, {g.r}, {g.s}], \"form\": {jsonForm f}, \"image\": {jsonForm (rho g f)}}"
  let pairs := [((⟨1, 0, 1⟩ : Form), (⟨1, 1, 1⟩ : Form)), (⟨1, 0, 1⟩, ⟨2, 1, 1⟩), (⟨1, 1, 1⟩, ⟨3, 1, 1⟩)].map fun (f, g) =>
    s!"\{\"first\": {jsonForm f}, \"second\": {jsonForm g}, \"normal\": {jsonForm (pairNormal f g)}}"
  "{\n" ++
  s!"  \"generator\": \"lake exe starscape-bridge\",\n" ++
  s!"  \"ball6\": {(ball 6).length},\n" ++
  s!"  \"stars\": \{\"24\": {(stars 24).length}, \"48\": {(stars 48).length}, \"57\": {(stars 57).length}},\n" ++
  s!"  \"classes\": {jsonList classes},\n" ++
  s!"  \"images\": {jsonList images},\n" ++
  s!"  \"pairs\": {jsonList pairs}\n" ++
  "}\n"

def main (args : List String) : IO Unit := do
  let path := args.headD "../data/lean-bridge.json"
  IO.FS.writeFile path bridge
  IO.println s!"wrote {path}"
