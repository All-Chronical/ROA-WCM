> Rivals of Aether Workshop Content Manager is A webapp for intuitively sorting and organizing your Rivals of Aether workshop content

<img width="3880" height="1480" alt="logo" src="https://github.com/user-attachments/assets/bba1ba5c-a26f-4f2d-a35e-b123572f987b" />

# Features
- Displaying an expanded layout of all content pages
- Allowing drag-and-drop style re-ordering with bulk selection support
- Allowing creating new categories and renaming them

# Tips of usage
> [!IMPORTANT]
> Ensure that you have already generated categories.roa and order.roa by changing the order of at least one character through the in-game workshop tab

> [!TIP]
> - Clicking 'refresh' will discard all the changes you have and reload the files
> - In order to delete a category simply ensure that it is empty by dragging every entry out of it, saving, and then refreshing
> - You can drag a cell to the top and bottom edge of the screen to scroll through the page

# Acknowledgments
- Programming the parser of the .roa files was heavily inspired by Python implementation from [ROA Order Manager](https://github.com/GiovanH/roa-order-manager) by [GiovanH](https://github.com/GiovanH)
- Parts of this project were developed with assistance from Large Langauage Models. All generated code has been reviewed and validated.

# Todo List
 ## Release 2
 - [ ] App icon
 - [ ] Make categories collapsible
 - [ ] In-app warning if .roa files don't exist
 - [ ] Stash panel on the right (can't save with anything stashed)

## Release 1
 - [x] Initial grid setup of characters and categories
 - [x] Swap drag and drop
 - [x] Insert drag and drop
 - [x] Layout clean-up
 - [x] Open folder button
 - [x] Allow creating/renaming categories
 - [x] Allow scrolling across the page while dragging entries
 - [x] Fix thumbnail appearance

