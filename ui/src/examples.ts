export interface Example {
  id: string;
  title: string;
  summary: string;
  expected: string;
  experiment: string;
  hints?: string[];
  files: Record<string, string>;
  rootClass: string;
  stdin: string;
  expectedOutput: string;
}

const main = (body: string, locals = "") => `class MAIN
create {}
   make
feature {}
   make
${locals ? `      local\n${locals}\n` : ""}      do
${body}
      end
end
`;

const hello = main('         io.put_string("Hello, world!%N")');

export const examples: Example[] = [
  {
    id: "hello",
    title: "Hello world",
    summary:
      "An Eiffel program starts by creating an object and calling its creation routine. Here, MAIN is the class and make is that routine. %N starts a new line.",
    expected: "A greeting appears in the output.",
    experiment: "Change the greeting inside the quotes and run it again.",
    files: { "main.e": hello },
    rootClass: "main.e",
    stdin: "",
    expectedOutput: "Hello, world!\n",
  },
  {
    id: "loops",
    title: "Variables and loops",
    summary:
      "Local variables have declared types. := assigns a value. A from … until … loop repeats until its condition becomes true.",
    expected: "The numbers 1 through 5 appear, followed by their total: 15.",
    experiment:
      "Change the upper limit from 5 to 10. What should the new total be?",
    files: {
      "main.e": main(
        `         from
            number := 1
         until
            number > 5
         loop
            io.put_integer(number)
            io.put_new_line
            total := total + number
            number := number + 1
         end
         io.put_string("Total: ")
         io.put_integer(total)
         io.put_new_line`,
        "         number, total: INTEGER",
      ),
    },
    rootClass: "main.e",
    stdin: "",
    expectedOutput: "1\n2\n3\n4\n5\nTotal: 15\n",
  },
  {
    id: "input",
    title: "Text input",
    summary:
      "io.read_line reads a line into io.last_string. Supply your input before pressing Run; once that text is consumed, the program reaches the end of input.",
    expected: "The program greets Ada using the supplied input.",
    experiment: "Replace Ada in the Input box with your own name.",
    files: {
      "main.e": main(`         io.read_line
         io.put_string("Hello, ")
         io.put_string(io.last_string)
         io.put_string("!%N")`),
    },
    rootClass: "main.e",
    stdin: "Ada\n",
    expectedOutput: "Hello, Ada!\n",
  },
  {
    id: "objects",
    title: "Objects and state",
    summary:
      "Each object keeps its own state. MAIN creates two COUNTER objects, then changes only one of them. Open counter.e to see the class they share.",
    expected: "The first counter reaches 2. The second stays at 0.",
    experiment:
      "Add a call to second.increment. Does it change the first counter?",
    files: {
      "main.e": main(
        `         create first.make
         create second.make
         first.increment
         first.increment
         io.put_integer(first.value)
         io.put_new_line
         io.put_integer(second.value)
         io.put_new_line`,
        "         first, second: COUNTER",
      ),
      "counter.e": `class COUNTER
create {ANY}
   make
feature {ANY}
   value: INTEGER

   make
      do
         value := 0
      end

   increment
      do
         value := value + 1
      end
end
`,
    },
    rootClass: "main.e",
    stdin: "",
    expectedOutput: "2\n0\n",
  },
  {
    id: "collections",
    title: "Generic collections",
    summary:
      "ARRAY[INTEGER] is an array whose elements are integers. This array has explicitly chosen bounds, 1 and 3. The compiler checks the element types.",
    expected: "Three scores add up to 60.",
    experiment:
      "Change one score. Then try putting a string in the array and read the compiler’s response.",
    files: {
      "main.e": main(
        `         create scores.make(1, 3)
         scores.put(10, 1)
         scores.put(20, 2)
         scores.put(30, 3)
         from
            index := scores.lower
         until
            index > scores.upper
         loop
            total := total + scores.item(index)
            index := index + 1
         end
         io.put_integer(total)
         io.put_new_line`,
        "         scores: ARRAY[INTEGER]\n         index, total: INTEGER",
      ),
    },
    rootClass: "main.e",
    stdin: "",
    expectedOutput: "60\n",
  },
  {
    id: "inheritance",
    title: "Inheritance",
    summary:
      "DOG inherits from ANIMAL and redefines its sound feature. Even through a variable declared as ANIMAL, a DOG responds with its own implementation.",
    expected: "The dog says Woof!",
    experiment:
      "Change sound in dog.e. Then create an ANIMAL instead of a DOG in main.e.",
    files: {
      "main.e": main(
        `         create {DOG} animal
         io.put_string(animal.sound)
         io.put_new_line`,
        "         animal: ANIMAL",
      ),
      "animal.e": `class ANIMAL
feature {ANY}
   sound: STRING
      do
         Result := "An animal sound"
      end
end
`,
      "dog.e": `class DOG
inherit
   ANIMAL
      redefine sound end
feature {ANY}
   sound: STRING
      do
         Result := "Woof!"
      end
end
`,
    },
    rootClass: "main.e",
    stdin: "",
    expectedOutput: "Woof!\n",
  },
  {
    id: "contracts",
    title: "Contracts",
    summary:
      "Contracts describe what a routine expects and guarantees. require checks the caller, ensure checks the result, and invariant describes a rule the object must maintain. old refers to a value before the routine ran.",
    expected: "A deposit of 100 and a withdrawal of 30 leave a balance of 70.",
    experiment:
      "Change withdraw(30) to withdraw(130) in main.e. The enough_funds precondition should stop the withdrawal.",
    hints: [
      "Postcondition: in account.e, change balance := balance - amount to balance := balance - amount - 1. The debited condition should catch the mistake.",
      "Invariant: change the initialization in make from balance := 0 to balance := -1. The non_negative invariant should fail.",
    ],
    files: {
      "main.e": main(
        `         create account.make
         account.deposit(100)
         account.withdraw(30)
         io.put_string("Balance: ")
         io.put_integer(account.balance)
         io.put_new_line`,
        "         account: ACCOUNT",
      ),
      "account.e": `class ACCOUNT
create {ANY}
   make
feature {ANY}
   balance: INTEGER

   make
      do
         balance := 0
      end

   deposit (amount: INTEGER)
      require
         positive_amount: amount > 0
      do
         balance := balance + amount
      ensure
         credited: balance = old balance + amount
      end

   withdraw (amount: INTEGER)
      require
         positive_amount: amount > 0
         enough_funds: amount <= balance
      do
         balance := balance - amount
      ensure
         debited: balance = old balance - amount
      end

invariant
   non_negative: balance >= 0
end
`,
    },
    rootClass: "main.e",
    stdin: "",
    expectedOutput: "Balance: 70\n",
  },
  {
    id: "my-program",
    title: "My program",
    summary:
      "Start with this small program or add your own classes. Each class belongs in a matching .e file. Choose which file to run when your project has several files.",
    expected: "Your program’s output appears below the editor.",
    experiment: "Make it your own. Add a file when you want another class.",
    files: { "main.e": hello },
    rootClass: "main.e",
    stdin: "",
    expectedOutput: "Hello, world!\n",
  },
];
