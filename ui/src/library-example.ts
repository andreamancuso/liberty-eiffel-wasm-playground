import type { Example } from "./examples.ts";

export const libraryExample: Example = {
  id: "library-loans",
  title: "Library loans",
  summary:
    "A small library brings objects, generic collections, and contracts together. Start in main.e for the scenario. library.e manages the catalogue and loans; book.e holds each book’s state; borrower.e defines names and loan limits. Each Run starts with fresh library data.",
  expected:
    "All three books start available. After borrowing and returning, Grace has two loans, Ada has none, and one book is available.",
  experiment:
    "Immediately after library.borrow(intro, ada), add library.borrow(intro, grace). The book_available precondition should stop the second loan.",
  hints: [
    "Loan limit: immediately after Ada’s first loan, add library.borrow(reusable, ada). Ada’s limit is one, so within_loan_limit should fail.",
    "Return ownership: change library.give_back(intro, ada) to library.give_back(intro, grace). The borrowed_by_you precondition should fail.",
    "Postcondition: in library.e, remove a_book.lend_to(a_borrower) from borrow. The book_assigned postcondition should catch the missing update.",
    "Invariant: in library.e, replace within_loan_limit: loans_of(a_borrower) < a_borrower.loan_limit with within_loan_limit: True. In main.e, add library.borrow(reusable, grace) after Grace’s second loan. The loan_limits_respected invariant should catch the third loan.",
  ],
  rootClass: "main.e",
  stdin: "",
  expectedOutput:
    "Initial catalogue\nEiffel basics: available\nDesign by Contract: available\nReusable classes: available\nAvailable: 3\n\nFinal catalogue\nEiffel basics: Grace\nDesign by Contract: Grace\nReusable classes: available\nAvailable: 1\nAda loans: 0\nGrace loans: 2\n",
  files: {
    "main.e": `class MAIN
create {}
   make
feature {}
   make
      local
         library: LIBRARY
         intro, contracts, reusable: BOOK
         ada, grace: BORROWER
      do
         create library.make
         create intro.make("Eiffel basics")
         create contracts.make("Design by Contract")
         create reusable.make("Reusable classes")
         library.add_book(intro)
         library.add_book(contracts)
         library.add_book(reusable)
         create ada.make("Ada", 1)
         create grace.make("Grace", 2)

         show_catalogue("Initial catalogue", library)

         library.borrow(intro, ada)
         library.borrow(contracts, grace)
         library.give_back(intro, ada)
         library.borrow(intro, grace)

         io.put_new_line
         show_catalogue("Final catalogue", library)
         io.put_string("Ada loans: ")
         io.put_integer(library.loans_of(ada))
         io.put_new_line
         io.put_string("Grace loans: ")
         io.put_integer(library.loans_of(grace))
         io.put_new_line
      end

   show_catalogue (heading: STRING; library: LIBRARY)
      local
         index: INTEGER
         book: BOOK
      do
         io.put_string(heading)
         io.put_new_line
         from index := 1 until index > library.book_count loop
            book := library.book_at(index)
            io.put_string(book.title)
            io.put_string(": ")
            if book.is_available then
               io.put_string("available")
            else
               io.put_string(book.current_borrower.name)
            end
            io.put_new_line
            index := index + 1
         end
         io.put_string("Available: ")
         io.put_integer(library.available_count)
         io.put_new_line
      end
end
`,
    "library.e": `class LIBRARY
create {ANY}
   make
feature {ANY}
   make
      do
         create catalogue.make
      ensure
         empty: book_count = 0
      end

   book_count: INTEGER
      do
         Result := catalogue.count
      end

   book_at (index: INTEGER): BOOK
      require
         valid_index: index >= 1 and then index <= book_count
      do
         Result := catalogue.item(index)
      end

   has_book (a_book: BOOK): BOOLEAN
         -- Membership compares object identity, not titles.
      local
         index: INTEGER
      do
         from index := 1 until Result or else index > catalogue.count loop
            Result := catalogue.item(index) = a_book
            index := index + 1
         end
      end

   available_count: INTEGER
      local
         index: INTEGER
      do
         from index := 1 until index > catalogue.count loop
            if catalogue.item(index).is_available then
               Result := Result + 1
            end
            index := index + 1
         end
      end

   loans_of (a_borrower: BORROWER): INTEGER
         -- Limits and counts apply to this library's catalogue.
      require
         borrower_exists: a_borrower /= Void
      local
         index: INTEGER
      do
         from index := 1 until index > catalogue.count loop
            if catalogue.item(index).current_borrower = a_borrower then
               Result := Result + 1
            end
            index := index + 1
         end
      end

   add_book (a_book: BOOK)
      require
         book_exists: a_book /= Void
         not_already_registered: not has_book(a_book)
         book_available: a_book.is_available
      do
         catalogue.add_last(a_book)
      ensure
         registered: has_book(a_book)
         one_more_book: book_count = old book_count + 1
         one_more_available: available_count = old available_count + 1
      end

   borrow (a_book: BOOK; a_borrower: BORROWER)
      require
         book_registered: has_book(a_book)
         borrower_exists: a_borrower /= Void
         book_available: a_book.is_available
         within_loan_limit: loans_of(a_borrower) < a_borrower.loan_limit
      do
         a_book.lend_to(a_borrower)
      ensure
         book_assigned: a_book.current_borrower = a_borrower
         one_more_loan: loans_of(a_borrower) = old loans_of(a_borrower) + 1
         one_fewer_available: available_count = old available_count - 1
      end

   give_back (a_book: BOOK; a_borrower: BORROWER)
      require
         book_registered: has_book(a_book)
         borrower_exists: a_borrower /= Void
         book_on_loan: not a_book.is_available
         borrowed_by_you: a_book.current_borrower = a_borrower
      do
         a_book.mark_returned
      ensure
         available_again: a_book.is_available
         one_fewer_loan: loans_of(a_borrower) = old loans_of(a_borrower) - 1
         one_more_available: available_count = old available_count + 1
      end

feature {} -- Keep the mutable collection inside LIBRARY.
   catalogue: LINKED_LIST[BOOK]

   catalogue_valid: BOOLEAN
      local
         index, other: INTEGER
      do
         Result := True
         from index := 1 until not Result or else index > catalogue.count loop
            Result := catalogue.item(index) /= Void
            from other := index + 1 until not Result or else other > catalogue.count loop
               Result := catalogue.item(index) /= catalogue.item(other)
               other := other + 1
            end
            index := index + 1
         end
      end

   loans_within_limits: BOOLEAN
      local
         index: INTEGER
         person: BORROWER
      do
         Result := True
         from index := 1 until not Result or else index > catalogue.count loop
            person := catalogue.item(index).current_borrower
            if person /= Void then
               Result := loans_of(person) <= person.loan_limit
            end
            index := index + 1
         end
      end

invariant
   catalogue_present: catalogue /= Void
   valid_unique_books: catalogue_valid
   availability_in_bounds: available_count >= 0 and then available_count <= book_count
   loan_limits_respected: loans_within_limits
end
`,
    "book.e": `class BOOK
create {ANY}
   make
feature {ANY}
   title: STRING
   current_borrower: BORROWER

   make (a_title: STRING)
      require
         title_provided: a_title /= Void and then not a_title.is_empty
      do
         title := a_title.twin
      ensure
         title_set: title.is_equal(a_title)
         initially_available: is_available
      end

   is_available: BOOLEAN
      do
         Result := current_borrower = Void
      end

feature {LIBRARY} -- Clients request loans through the library.
   lend_to (a_borrower: BORROWER)
      require
         borrower_exists: a_borrower /= Void
         book_available: is_available
      do
         current_borrower := a_borrower
      ensure
         borrower_set: current_borrower = a_borrower
      end

   mark_returned
      require
         book_on_loan: not is_available
      do
         current_borrower := Void
      ensure
         available: is_available
      end

invariant
   title_present: title /= Void
   title_not_empty: not title.is_empty
end
`,
    "borrower.e": `class BORROWER
create {ANY}
   make
feature {ANY}
   name: STRING
   loan_limit: INTEGER

   make (a_name: STRING; a_limit: INTEGER)
      require
         name_provided: a_name /= Void and then not a_name.is_empty
         positive_limit: a_limit > 0
      do
         name := a_name.twin
         loan_limit := a_limit
      ensure
         name_set: name.is_equal(a_name)
         limit_set: loan_limit = a_limit
      end

invariant
   name_present: name /= Void
   name_not_empty: not name.is_empty
   positive_loan_limit: loan_limit > 0
end
`,
  },
};
