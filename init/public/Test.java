/// A source code file which is simply copied into the built site.
/// Tada will not process this file: it won't create an HTML file for it
/// (even if `features.code` is `true`) and it won't appear in search results
/// (even if `features.search` is `true`).
public class Test {
  public static void main(String[] args) {
    System.out.println("hello");
  }
}
