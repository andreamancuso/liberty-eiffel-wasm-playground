export const hello = (marker) => ({
  rootClass: "hello.e",
  files: {
    "hello.e": `class HELLO create {} make feature {} make do io.put_string("${marker}%N") end end`,
  },
});
export const multi = {
  rootClass: "hello.e",
  files: {
    "hello.e": `class HELLO create {} make feature {} make
        local values: ARRAY[INTEGER]; child: VALUE_CHILD
        do
            create values.make(1, 2)
            values.put(19, 1)
            values.put(23, 2)
            create child
            io.put_integer(values.item(1) + values.item(2))
            io.put_new_line
            io.put_integer(child.value)
            io.put_new_line
        end end`,
    "value_base.e":
      "class VALUE_BASE feature {ANY} value: INTEGER do Result := 40 end end",
    "value_child.e":
      "class VALUE_CHILD inherit VALUE_BASE redefine value end feature {ANY} value: INTEGER do Result := Precursor + 2 end end",
  },
};
export const invalid = [
  {
    name: "syntax",
    source:
      "class HELLO create {} make feature {} make do io.put_string( end end",
    diagnostic: /hello|line|syntax/i,
  },
  {
    name: "type",
    source:
      'class HELLO create {} make feature {} make local i: INTEGER do i := "wrong" end end',
    diagnostic: /INTEGER|STRING|assign/i,
  },
  {
    name: "missing_class",
    source:
      "class HELLO create {} make feature {} make local x: MISSING_HELPER do create x end end",
    diagnostic: /MISSING_HELPER/i,
  },
];
