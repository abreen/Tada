/// A class representing a rectangle with integer side lengths.
///
/// Objects of this class may be _mutated_ (that is, changed after construction)
/// by scaling using a _scale factor_ (a floating-point number between 0 and 1).
public class Rectangle {
    private int width;
    private int height;

    public Rectangle(int width, int height) {
        setWidth(width);
        setHeight(height);
    }

    /// These methods are `private` because we decided to allow mutations
    /// only by scaling, not by directly setting the width or height to a new
    /// value.

    private void setWidth(int newWidth) {
        if (newWidth <= 0) {
            throw new IllegalArgumentException("width must be positive");
        }
        width = newWidth;
    }

    private void setHeight(int newHeight) {
        if (newHeight <= 0) {
            throw new IllegalArgumentException("height must be positive");
        }
        height = newHeight;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    /// An example of an accessor that does some computation with the fields'
    /// values before returning something.
    public int getArea() {
        return getWidth() * getHeight();
    }

    /// The scaling methods don't return a value since they change the
    /// rectangle on which the methods are invoked. For example:
    /// ```java
    /// Rectangle r1 = new Rectangle(10, 2);
    /// r1.scaleHorizontally(0.5f);
    /// IO.println("new width: " + r1.getWidth());
    /// ```
    /// Outputs:
    /// ```
    /// new width: 5
    /// ```

    public void scaleHorizontally(float scaleFactor) {
        checkScaleFactor(scaleFactor);
        setWidth(Math.round(getWidth() * scaleFactor));
    }

    public void scaleVertically(float scaleFactor) {
        checkScaleFactor(scaleFactor);
        setHeight(Math.round(getHeight() * scaleFactor));
    }

    /// Since both mutator methods must check for an invalid scale factor,
    /// we implement the logic in a _helper method_.
    /// * The method is `private` since clients do not need to call it.
    /// * The method is `static` since it does not need access to any
    ///   instance fields; it only uses its parameter.
    private static void checkScaleFactor(float scaleFactor) {
        if (scaleFactor < 0 || scaleFactor > 1) {
            throw new IllegalArgumentException(
                "scale factor must be between zero and one"
            );
        }
    }
}
